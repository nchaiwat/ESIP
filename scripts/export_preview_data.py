from __future__ import annotations

import csv
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg

from esip.input_safety import evaluate_input_file_safety
from esip.postgres import database_url


REFERENCE_COVERAGE = [
    {
        "report": "Daily / Monthly Sales Trend",
        "status": "AVAILABLE",
        "note": "Uses all Daily Raw dates currently loaded",
    },
    {
        "report": "MT Comparison, Top Branch, Top SKU",
        "status": "AVAILABLE",
        "note": "Current available period",
    },
    {
        "report": "Stock on Hand",
        "status": "AVAILABLE",
        "note": "Latest snapshot for each MT",
    },
    {
        "report": "YoY 2025 vs 2026",
        "status": "AVAILABLE",
        "note": "Available where 2025 and 2026 dates overlap",
    },
    {
        "report": "Gross Profit / Margin",
        "status": "SIMULATION_MODEL",
        "note": "Uses COGS assumption until actual cost is connected",
    },
    {
        "report": "Target / Forecast / Achievement",
        "status": "SIMULATION_MODEL",
        "note": "Uses target uplift and run-rate assumptions until target files arrive",
    },
    {
        "report": "Stock on Order / Last Receive",
        "status": "SIMULATION_MODEL",
        "note": "Uses supply uplift assumption until order and receipt history arrives",
    },
]


def _json_value(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _query(cursor: psycopg.Cursor, sql: str) -> list[dict[str, object]]:
    cursor.execute(sql)
    columns = [item.name for item in cursor.description or ()]
    return [
        {column: _json_value(value) for column, value in zip(columns, row, strict=True)}
        for row in cursor.fetchall()
    ]


def _number(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def _sort_product_review_queue(
    rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Put evidence-backed candidates first without changing governed priority ranks."""
    evidence_order = {
        "EXACT_ITEM_MASTER_BARCODE": 0,
        "UNIQUE_CROSS_SOURCE_OSCN": 1,
        "EXISTING_OSCN": 2,
        "NO_EXACT_CANDIDATE": 3,
    }
    return sorted(
        rows,
        key=lambda row: (
            evidence_order.get(row.get("candidate_basis", ""), 9),
            -_number(row.get("total_affected_rows")),
            _number(row.get("priority_rank")),
        ),
    )


def _sort_branch_review_queue(
    rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Put high-confidence branch candidates first for faster human review."""
    return sorted(
        rows,
        key=lambda row: (
            0 if row.get("recommendation") == "HIGH_CONFIDENCE_CANDIDATE" else 1,
            0 if row.get("candidate_basis") == "SAME_CODE_NAME_ENRICHMENT" else 1,
            -_number(row.get("affected_rows")),
            _number(row.get("priority_rank")),
        ),
    )


def _sum(rows: list[dict[str, object]], key: str) -> float:
    return sum(_number(row.get(key)) for row in rows)


def _build_dashboard_summary(payload: dict[str, object]) -> dict[str, object]:
    trend = list(payload.get("trend", []))
    source_sales = list(payload.get("source_sales", []))
    top_branches = list(payload.get("top_branches", []))
    top_products = list(payload.get("top_products", []))
    inventory = list(payload.get("inventory", []))
    freshness = list(payload.get("freshness", []))
    data_quality = [
        row
        for row in payload.get("source_sales", [])
        if _number(row.get("net_amount")) == 0 and _number(row.get("net_qty")) > 0
    ]
    trend_dates = [str(row.get("sales_date")) for row in trend if row.get("sales_date")]
    coverage = {
        "first_date": trend_dates[0] if trend_dates else None,
        "last_date": trend_dates[-1] if trend_dates else None,
        "available_days": len(trend_dates),
        "sales_rows": int(
            _sum(
                [
                    row
                    for row in payload.get("coverage", [])
                    if row.get("dataset") == "sales"
                ],
                "staged_rows",
            )
        ),
        "sales_qty": _sum(trend, "net_qty"),
        "sales_amount": _sum(trend, "net_amount"),
    }
    return {
        "coverage": coverage,
        "trend": trend,
        "source_sales": source_sales,
        "top_branches": top_branches,
        "top_products": top_products,
        "inventory": inventory,
        "source_status": freshness,
        "data_quality": [
            {
                "source_code": row.get("source_code"),
                "issue": "SALES_AMOUNT_ZERO",
                "affected_rows": row.get("net_qty"),
            }
            for row in data_quality
        ],
        "reference_coverage": REFERENCE_COVERAGE,
        "approval_queue_total": len(payload.get("product_queue", []))
        + len(payload.get("branch_queue", [])),
        "publication_queue_total": len(payload.get("publication_queue", [])),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output = root / ".tmp_review" / "preview_data.json"
    dashboard_output = root / ".tmp_review" / "dashboard_data.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            payload = {
                "coverage": _query(
                    cursor,
                    """SELECT source_code, dataset,
                    SUM(staged_rows) AS staged_rows,
                    SUM(quarantined_rows) AS quarantined_rows,
                    SUM(source_rows) AS total_rows,
                    CASE WHEN SUM(source_rows) = 0 THEN 0
                    ELSE SUM(staged_rows)::DOUBLE PRECISION / SUM(source_rows) END
                    AS staged_rate
                    FROM import_batch b
                    JOIN batch_reconciliation r USING(import_batch_id)
                    GROUP BY source_code, dataset
                    ORDER BY source_code, dataset""",
                ),
                "freshness": _query(
                    cursor,
                    """WITH sales AS (
                        SELECT source_code, MAX(sales_date) AS latest_sales_date
                        FROM fact_sales GROUP BY source_code
                    ), inventory AS (
                        SELECT source_code, MAX(snapshot_date) AS latest_inventory_date
                        FROM fact_inventory_snapshot GROUP BY source_code
                    ), latest AS (
                        SELECT
                            (SELECT MAX(sales_date) FROM fact_sales) AS latest_sales_date,
                            (SELECT MAX(snapshot_date) FROM fact_inventory_snapshot)
                                AS latest_inventory_date
                    )
                    SELECT d.source_code, d.source_name, d.enabled,
                    s.latest_sales_date,
                    CASE WHEN s.latest_sales_date IS NULL THEN NULL
                         ELSE l.latest_sales_date - s.latest_sales_date END
                        AS sales_days_behind,
                    CASE WHEN NOT d.enabled THEN 'WAITING_FOR_FIRST_DAILY_RAW'
                         WHEN s.latest_sales_date IS NULL THEN 'NO_DATA'
                         WHEN s.latest_sales_date = l.latest_sales_date THEN 'CURRENT'
                         ELSE 'LAGGING' END AS sales_status,
                    i.latest_inventory_date,
                    CASE WHEN i.latest_inventory_date IS NULL THEN NULL
                         ELSE l.latest_inventory_date - i.latest_inventory_date END
                        AS inventory_days_behind,
                    CASE WHEN NOT d.enabled THEN 'WAITING_FOR_FIRST_DAILY_RAW'
                         WHEN i.latest_inventory_date IS NULL THEN 'NO_DATA'
                         WHEN i.latest_inventory_date = l.latest_inventory_date THEN 'CURRENT'
                         ELSE 'LAGGING' END AS inventory_status
                    FROM dim_source d
                    LEFT JOIN sales s USING(source_code)
                    LEFT JOIN inventory i USING(source_code)
                    CROSS JOIN latest l
                    ORDER BY d.source_code""",
                ),
                "batches": _query(
                    cursor,
                    """SELECT b.source_code, b.source_file_name, b.status,
                    b.imported_at_utc, r.dataset, r.source_rows, r.staged_rows,
                    r.quarantined_rows, r.passed
                    FROM import_batch b JOIN batch_reconciliation r USING(import_batch_id)
                    ORDER BY b.imported_at_utc DESC, b.source_code, r.dataset""",
                ),
                "trend": _query(
                    cursor,
                    """SELECT sales_date, SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales GROUP BY sales_date ORDER BY sales_date""",
                ),
                "source_sales": _query(
                    cursor,
                    """SELECT source_code, MIN(sales_date) AS first_date,
                    MAX(sales_date) AS last_date,
                    COUNT(DISTINCT sales_date) AS available_days,
                    SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales GROUP BY source_code ORDER BY net_amount DESC""",
                ),
                "top_branches": _query(
                    cursor,
                    """SELECT source_code, branch_source_name,
                    SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales
                    GROUP BY source_code, branch_source_name
                    ORDER BY net_amount DESC LIMIT 15""",
                ),
                "top_products": _query(
                    cursor,
                    """SELECT sap_item_code, MAX(product_source_code) AS source_sku,
                    SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales WHERE sap_item_code IS NOT NULL
                    GROUP BY sap_item_code ORDER BY net_amount DESC LIMIT 15""",
                ),
                "inventory": _query(
                    cursor,
                    """WITH latest AS (
                        SELECT source_code, MAX(snapshot_date) AS snapshot_date
                        FROM fact_inventory_snapshot GROUP BY source_code
                    )
                    SELECT i.source_code, l.snapshot_date,
                    SUM(i.onhand_qty) AS onhand_qty,
                    SUM(i.onhand_value) AS onhand_value
                    FROM fact_inventory_snapshot i
                    JOIN latest l USING(source_code, snapshot_date)
                    GROUP BY i.source_code, l.snapshot_date
                    ORDER BY i.source_code""",
                ),
                "quarantine": _query(
                    cursor,
                    """SELECT b.source_code, r.dataset,
                    CASE WHEN SUM(r.quarantined_rows) > 0
                         THEN 'QUARANTINED_ROWS'
                         ELSE 'NO_QUARANTINE' END AS reason_code,
                    SUM(r.quarantined_rows) AS affected_rows
                    FROM import_batch b
                    JOIN batch_reconciliation r USING(import_batch_id)
                    GROUP BY b.source_code, r.dataset
                    HAVING SUM(r.quarantined_rows) > 0
                    ORDER BY affected_rows DESC, b.source_code, r.dataset""",
                ),
            }
    for key, filename in (
        ("product_queue", "product_mapping_queue.csv"),
        ("branch_queue", "branch_mapping_approval_queue.csv"),
        ("publication_queue", "publication_readiness_queue.csv"),
    ):
        path = root / "output" / "operations" / filename
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            payload[key] = list(csv.DictReader(stream))
    payload["product_queue"] = _sort_product_review_queue(payload["product_queue"])
    payload["branch_queue"] = _sort_branch_review_queue(payload["branch_queue"])
    quality_path = (
        root / "output" / "operations" / "mapping_candidate_quality.json"
    )
    payload["candidate_quality"] = json.loads(
        quality_path.read_text(encoding="utf-8")
    )
    dashboard_summary = _build_dashboard_summary(payload)
    dashboard_output.write_text(
        json.dumps(dashboard_summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    payload["input_safety"] = evaluate_input_file_safety(root)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
