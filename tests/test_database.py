import sqlite3
from pathlib import Path


def test_schema_creates_governed_tables_and_deduplicates_hashes() -> None:
    root = Path(__file__).resolve().parents[1]
    schema = (root / "database" / "schema.sql").read_text(encoding="utf-8")
    connection = sqlite3.connect(":memory:")
    connection.executescript(schema)

    tables = {
        row[0]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    assert {
        "import_batch",
        "fact_sales",
        "fact_inventory_snapshot",
        "quarantine_record",
        "batch_reconciliation",
        "batch_governance",
        "dim_source",
        "dim_product",
        "dim_branch",
        "dim_calendar",
        "bridge_source_branch",
        "semantic_measure_catalog",
    } <= tables

    views = {
        row[0]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'view'")
    }
    assert {
        "vw_batch_health",
        "vw_dataset_coverage",
        "vw_quarantine_operations",
        "vw_published_sales",
        "vw_published_inventory",
        "vw_daily_sales_kpi",
        "vw_inventory_position",
        "vw_star_sales",
        "vw_star_inventory",
        "vw_product_master_completeness",
        "vw_branch_crosswalk_coverage",
        "vw_semantic_daily_sales",
        "vw_semantic_inventory_snapshot",
    } <= views

    batch = ("b1", "DH", "a.xlsx", "A" * 64, "2026-07-22T00:00:00Z", "RECEIVED")
    connection.execute("INSERT INTO import_batch VALUES (?, ?, ?, ?, ?, ?)", batch)
    duplicate = ("b2", "DH", "copy.xlsx", "A" * 64, "2026-07-22T00:01:00Z", "RECEIVED")
    try:
        connection.execute("INSERT INTO import_batch VALUES (?, ?, ?, ?, ?, ?)", duplicate)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("duplicate file hashes must be rejected")

    shared_delivery = ("b3", "MH", "a.xlsx", "A" * 64, "2026-07-22T00:02:00Z", "RECEIVED")
    connection.execute("INSERT INTO import_batch VALUES (?, ?, ?, ?, ?, ?)", shared_delivery)
