import csv
import sqlite3
from pathlib import Path

import pytest

from esip.operations import export_view


def test_export_view_writes_headers_and_rows(tmp_path: Path) -> None:
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE source (id INTEGER, value TEXT)")
    connection.execute("INSERT INTO source VALUES (1, 'ok')")
    connection.execute("CREATE VIEW vw_batch_health AS SELECT * FROM source")
    output = tmp_path / "batch_health.csv"
    assert export_view(connection, "vw_batch_health", output) == 1
    with output.open("r", encoding="utf-8-sig", newline="") as stream:
        assert list(csv.reader(stream)) == [["id", "value"], ["1", "ok"]]


def test_export_view_rejects_unapproved_sql_identifier(tmp_path: Path) -> None:
    connection = sqlite3.connect(":memory:")
    with pytest.raises(ValueError):
        export_view(connection, "sqlite_master", tmp_path / "bad.csv")


def test_quality_view_is_approved_for_export(tmp_path: Path) -> None:
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE VIEW vw_product_master_completeness AS SELECT 1 AS rows")
    assert export_view(
        connection, "vw_product_master_completeness", tmp_path / "quality.csv"
    ) == 1
