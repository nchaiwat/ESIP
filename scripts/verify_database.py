import sqlite3
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    connection = sqlite3.connect(root / "output" / "esip_provisional.db")
    print("integrity", connection.execute("PRAGMA integrity_check").fetchone()[0])
    print("foreign_keys", connection.execute("PRAGMA foreign_key_check").fetchall())
    print(
        "batches",
        connection.execute(
            "SELECT source_code, status FROM import_batch ORDER BY source_code"
        ).fetchall(),
    )
    print(
        "sales",
        connection.execute(
            "SELECT source_code, COUNT(*) FROM fact_sales GROUP BY source_code "
            "ORDER BY source_code"
        ).fetchall(),
    )
    print(
        "inventory",
        connection.execute(
            "SELECT source_code, COUNT(*) FROM fact_inventory_snapshot GROUP BY source_code "
            "ORDER BY source_code"
        ).fetchall(),
    )
    print(
        "reconciliation",
        connection.execute("SELECT COUNT(*), SUM(passed) FROM batch_reconciliation").fetchone(),
    )
    print(
        "published",
        connection.execute(
            "SELECT COUNT(*) FROM import_batch WHERE status = 'PUBLISHED'"
        ).fetchone()[0],
    )
    print(
        "batch_health",
        connection.execute(
            "SELECT source_code, all_reconciliations_passed, publish_eligible "
            "FROM vw_batch_health ORDER BY source_code"
        ).fetchall(),
    )
    print(
        "dataset_coverage_rows",
        connection.execute("SELECT COUNT(*) FROM vw_dataset_coverage").fetchone()[0],
    )
    print(
        "quarantine_operation_groups",
        connection.execute("SELECT COUNT(*) FROM vw_quarantine_operations").fetchone()[0],
    )
    print(
        "published_sales_rows",
        connection.execute("SELECT COUNT(*) FROM vw_published_sales").fetchone()[0],
    )
    print(
        "published_inventory_rows",
        connection.execute("SELECT COUNT(*) FROM vw_published_inventory").fetchone()[0],
    )
    print(
        "daily_sales_kpi_rows",
        connection.execute("SELECT COUNT(*) FROM vw_daily_sales_kpi").fetchone()[0],
    )
    print(
        "dimensions",
        {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in ("dim_source", "dim_product", "dim_branch", "dim_calendar")
        },
    )
    print(
        "product_status",
        connection.execute(
            "SELECT master_record_status, COUNT(*) FROM dim_product "
            "GROUP BY master_record_status ORDER BY master_record_status"
        ).fetchall(),
    )
    print(
        "calendar_bounds",
        connection.execute(
            "SELECT MIN(calendar_date), MAX(calendar_date) FROM dim_calendar"
        ).fetchone(),
    )
    print(
        "unresolved_fact_products",
        connection.execute(
            "SELECT COUNT(*) FROM ("
            "SELECT sap_item_code FROM fact_sales UNION ALL "
            "SELECT sap_item_code FROM fact_inventory_snapshot) f "
            "LEFT JOIN dim_product p ON p.sap_item_code = f.sap_item_code "
            "WHERE f.sap_item_code IS NOT NULL AND p.sap_item_code IS NULL"
        ).fetchone()[0],
    )
    print(
        "source_branch_bridge_rows",
        connection.execute("SELECT COUNT(*) FROM bridge_source_branch").fetchone()[0],
    )
    print(
        "star_rows",
        (
            connection.execute("SELECT COUNT(*) FROM vw_star_sales").fetchone()[0],
            connection.execute("SELECT COUNT(*) FROM vw_star_inventory").fetchone()[0],
        ),
    )
    connection.close()


if __name__ == "__main__":
    main()
