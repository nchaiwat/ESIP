import csv
import json
import sqlite3
from pathlib import Path

from esip.readiness import (
    ReadinessGate,
    write_branch_remediation_queue,
    write_product_remediation_queue,
    write_readiness,
)


def test_readiness_outputs_are_machine_readable(tmp_path: Path) -> None:
    gates = [ReadinessGate("M1", "M1-01", "Requirement", "PASS", "Evidence", "None")]
    write_readiness(gates, tmp_path)
    assert json.loads((tmp_path / "milestone_readiness.json").read_text(encoding="utf-8"))[
        0
    ]["status"] == "PASS"
    with (tmp_path / "milestone_readiness.csv").open(
        "r", encoding="utf-8-sig", newline=""
    ) as stream:
        assert list(csv.DictReader(stream))[0]["gate_code"] == "M1-01"


def test_product_remediation_includes_fact_impact(tmp_path: Path) -> None:
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        "CREATE TABLE dim_product (sap_item_code TEXT, master_record_status TEXT);"
        "CREATE TABLE fact_sales (sap_item_code TEXT, source_code TEXT);"
        "CREATE TABLE fact_inventory_snapshot (sap_item_code TEXT, source_code TEXT);"
        "INSERT INTO dim_product VALUES ('I1', 'OSCN_ONLY');"
        "INSERT INTO fact_sales VALUES ('I1', 'DH');"
    )
    path = tmp_path / "products.csv"
    assert write_product_remediation_queue(connection, path) == 1
    assert "REQUEST_COMPLETE_OITM_RECORD" in path.read_text(encoding="utf-8-sig")


def test_branch_remediation_lists_distinct_identity(tmp_path: Path) -> None:
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        "CREATE TABLE fact_sales "
        "(source_code TEXT, branch_source_code TEXT, branch_source_name TEXT);"
        "CREATE TABLE fact_inventory_snapshot "
        "(source_code TEXT, branch_source_code TEXT, branch_source_name TEXT);"
        "INSERT INTO fact_sales VALUES ('DH', 'B1', 'Branch 1');"
    )
    candidate = tmp_path / "candidate.csv"
    candidate.write_text(
        "source_code,branch_source_code,branch_source_name,candidate_card_code,"
        "candidate_card_name,score,rank,recommendation\n",
        encoding="utf-8",
    )
    output = tmp_path / "branches.csv"
    assert write_branch_remediation_queue(connection, candidate, output) == 1
    assert "REVIEW_AND_APPROVE_BRANCH_MAPPING" in output.read_text(encoding="utf-8-sig")
