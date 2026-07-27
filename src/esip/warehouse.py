from __future__ import annotations

import csv
import sqlite3
from datetime import date, timedelta
from pathlib import Path

from esip.master_data import load_branch_master, load_item_master, load_oscn
from esip.profiles import load_yaml


def calendar_rows(start: date, end: date) -> list[tuple[object, ...]]:
    rows: list[tuple[object, ...]] = []
    current = start
    while current <= end:
        rows.append(
            (
                current.isoformat(),
                current.year,
                (current.month - 1) // 3 + 1,
                current.month,
                current.strftime("%B"),
                current.day,
                current.isocalendar().week,
                current.isoweekday(),
            )
        )
        current += timedelta(days=1)
    return rows


def load_warehouse_dimensions(
    connection: sqlite3.Connection, workspace: Path
) -> dict[str, int]:
    registry = load_yaml(workspace / "config" / "source_registry.yaml")
    connection.executemany(
        "INSERT INTO dim_source VALUES (?, ?, ?, ?)",
        (
            (
                source_code,
                details["name"],
                details["sap_cardcode_prefix"],
                int(details.get("enabled", True)),
            )
            for source_code, details in sorted(registry["sources"].items())
        ),
    )
    connection.executemany(
        "INSERT INTO semantic_measure_catalog VALUES (?, ?, ?, ?, ?, ?)",
        (
            (
                "sell_out_qty",
                "Sell-out Quantity",
                "sales",
                "SUM",
                "Quantity from SALE records only",
                "CERTIFIED_CONTRACT",
            ),
            (
                "sell_out_sales_ex_vat_after_discount",
                "Sell-out Sales Ex-VAT After Discount",
                "sales",
                "SUM",
                "Sales amount from SALE records, excluding VAT and after discount",
                "CERTIFIED_CONTRACT",
            ),
            (
                "return_qty",
                "Return Quantity",
                "sales",
                "ABS_SUM",
                "Absolute quantity from RETURN records",
                "CERTIFIED_CONTRACT",
            ),
            (
                "return_amount",
                "Return Amount Ex-VAT After Discount",
                "sales",
                "ABS_SUM",
                "Absolute amount from RETURN records, excluding VAT and after discount",
                "CERTIFIED_CONTRACT",
            ),
            (
                "net_sales_qty",
                "Net Sales Quantity",
                "sales",
                "SUM",
                "Signed sum of SALE and RETURN quantities",
                "DERIVED_CERTIFIED_CONTRACT",
            ),
            (
                "net_sales_amount_ex_vat_after_discount",
                "Net Sales Amount Ex-VAT After Discount",
                "sales",
                "SUM",
                "Signed sum of SALE and RETURN amounts, excluding VAT and after discount",
                "DERIVED_CERTIFIED_CONTRACT",
            ),
            (
                "onhand_qty",
                "On-hand Quantity",
                "inventory",
                "SUM",
                "On-hand quantity at source snapshot grain",
                "PENDING_SOURCE_VALIDATION",
            ),
        ),
    )

    item_path = (
        workspace / "MasterData" / "ItemMaster" / "incoming" / "ItemMaster_FGFU_OITM.xlsx"
    )
    oscn_path = (
        workspace
        / "MasterData"
        / "OSCN"
        / "incoming"
        / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx"
    )
    items, _ = load_item_master(item_path)
    oscn_records, _ = load_oscn(oscn_path)
    products: dict[str, tuple[str | None, str | None, str | None, str, str]] = {
        record.item_code: (None, None, None, "OSCN_ONLY", oscn_path.name)
        for record in oscn_records
    }
    for item in items:
        products[item.item_code] = (
            item.item_name,
            item.barcode,
            item.active,
            "ITEM_MASTER",
            item_path.name,
        )
    connection.executemany(
        "INSERT INTO dim_product VALUES (?, ?, ?, ?, ?, ?)",
        (
            (item_code, item_name, barcode, active, status, source_file)
            for item_code, (item_name, barcode, active, status, source_file) in sorted(
                products.items()
            )
        ),
    )

    branch_path = (
        workspace / "MasterData" / "BranchMaster" / "incoming" / "ModernTrade_Branch.xlsx"
    )
    branches, _ = load_branch_master(branch_path)
    connection.executemany(
        "INSERT INTO dim_branch VALUES (?, ?, ?, ?)",
        (
            (branch.card_code, branch.card_name, branch.card_code[:3], branch_path.name)
            for branch in branches
        ),
    )

    bounds = connection.execute(
        "SELECT MIN(value), MAX(value) FROM ("
        "SELECT sales_date AS value FROM fact_sales "
        "UNION ALL SELECT snapshot_date AS value FROM fact_inventory_snapshot)"
    ).fetchone()
    if bounds[0] and bounds[1]:
        rows = calendar_rows(date.fromisoformat(bounds[0]), date.fromisoformat(bounds[1]))
        connection.executemany("INSERT INTO dim_calendar VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)

    load_approved_branch_crosswalk(
        connection, workspace / "config" / "branch_crosswalk.csv"
    )

    return {
        table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in (
            "dim_source",
            "dim_product",
            "dim_branch",
            "dim_calendar",
            "semantic_measure_catalog",
        )
    }


def load_approved_branch_crosswalk(connection: sqlite3.Connection, path: Path) -> int:
    if not path.is_file():
        return 0
    approved: list[tuple[str, str, str, str, str, str]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for row_no, row in enumerate(csv.DictReader(stream), start=2):
            status = (row.get("mapping_status") or "").strip().upper()
            if not any((row.get(field) or "").strip() for field in row):
                continue
            if status != "APPROVED":
                continue
            approval = (row.get("approval_reference") or "").strip()
            if not approval:
                raise ValueError(f"approved branch crosswalk row {row_no} lacks approval_reference")
            approved.append(
                (
                    (row.get("source_code") or "").strip(),
                    (row.get("branch_source_code") or "").strip(),
                    (row.get("branch_source_name") or "").strip(),
                    (row.get("sap_card_code") or "").strip(),
                    status,
                    approval,
                )
            )
    connection.executemany(
        "INSERT INTO bridge_source_branch VALUES (?, ?, ?, ?, ?, ?)", approved
    )
    return len(approved)
