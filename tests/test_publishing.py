import sqlite3
from pathlib import Path

import pytest

from esip.publishing import evaluate_publish_eligibility, publish_batch


def database() -> sqlite3.Connection:
    root = Path(__file__).resolve().parents[1]
    connection = sqlite3.connect(":memory:")
    connection.executescript((root / "database" / "schema.sql").read_text(encoding="utf-8"))
    return connection


def insert_batch(connection: sqlite3.Connection, batch_id: str, classification: str) -> None:
    connection.execute(
        "INSERT INTO import_batch VALUES (?, 'DH', 'daily.xlsx', ?, '2026-07-22', 'RECONCILED')",
        (batch_id, ("A" if batch_id == "approved" else "B") * 64),
    )
    connection.execute(
        "INSERT INTO batch_governance VALUES (?, ?, ?, ?, ?)",
        (
            batch_id,
            classification,
            "APPROVED" if classification == "DAILY_RAW" else "DRAFT",
            "APPROVED" if classification == "DAILY_RAW" else "PENDING",
            "APR-1" if classification == "DAILY_RAW" else None,
        ),
    )
    connection.execute(
        "INSERT INTO batch_reconciliation "
        "(import_batch_id, dataset, source_rows, staged_rows, quarantined_rows, "
        "source_measure, staged_measure, quarantined_measure, passed) "
        "VALUES (?, 'sales', 1, 1, 0, 100, 100, 0, 1)",
        (batch_id,),
    )


def insert_sales_fact(connection: sqlite3.Connection, batch_id: str) -> None:
    connection.execute(
        "INSERT INTO fact_sales "
        "(source_code, sales_date, branch_source_code, product_source_code, sap_item_code, "
        "sales_qty, sales_amount_ex_vat_after_discount, record_type, import_batch_id, "
        "source_file_name, source_sheet_name, source_row_no) "
        "VALUES ('DH', '2026-07-22', 'B1', 'SKU1', 'I1', 2, 200, 'SALE', ?, "
        "'daily.xlsx', 'Sales', 2)",
        (batch_id,),
    )


def test_publish_guard_rejects_provisional_batch() -> None:
    connection = database()
    insert_batch(connection, "provisional", "PROVISIONAL_KPI")
    insert_sales_fact(connection, "provisional")
    decision = evaluate_publish_eligibility(connection, "provisional")
    assert not decision.eligible
    assert "INPUT_NOT_DAILY_RAW" in decision.reasons
    with pytest.raises(ValueError):
        publish_batch(connection, "provisional")
    assert connection.execute("SELECT COUNT(*) FROM vw_published_sales").fetchone()[0] == 0


def test_approved_daily_batch_can_transition_to_published() -> None:
    connection = database()
    insert_batch(connection, "approved", "DAILY_RAW")
    insert_sales_fact(connection, "approved")
    assert evaluate_publish_eligibility(connection, "approved").eligible
    publish_batch(connection, "approved")
    status = connection.execute(
        "SELECT status FROM import_batch WHERE import_batch_id = 'approved'"
    ).fetchone()[0]
    assert status == "PUBLISHED"
    assert connection.execute("SELECT COUNT(*) FROM vw_published_sales").fetchone()[0] == 1
    assert connection.execute("SELECT sales_qty FROM vw_daily_sales_kpi").fetchone()[0] == 2
    semantic = connection.execute(
        "SELECT sell_out_qty, sell_out_sales_ex_vat_after_discount, return_qty, "
        "net_sales_qty FROM vw_semantic_daily_sales"
    ).fetchone()
    assert semantic == (2, 200, 0, 2)
