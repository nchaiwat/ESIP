from __future__ import annotations

import csv
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg

from esip.input_safety import evaluate_input_file_safety
from esip.postgres import database_url


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


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output = root / ".tmp_review" / "preview_data.json"
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
                    """SELECT source_code, SUM(sales_qty) AS net_qty,
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
                    """SELECT source_code, dataset, reason_code, affected_rows
                    FROM vw_quarantine_operations
                    ORDER BY affected_rows DESC, source_code, dataset""",
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
    payload["input_safety"] = evaluate_input_file_safety(root)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
