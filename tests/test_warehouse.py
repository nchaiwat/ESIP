from datetime import date
import sqlite3
from pathlib import Path

import pytest

from esip.warehouse import calendar_rows, load_approved_branch_crosswalk


def test_calendar_rows_are_continuous_and_correct() -> None:
    rows = calendar_rows(date(2026, 3, 31), date(2026, 4, 1))
    assert [row[0] for row in rows] == ["2026-03-31", "2026-04-01"]
    assert rows[0][2] == 1
    assert rows[1][2] == 2
    assert rows[1][4] == "April"


def test_empty_branch_crosswalk_loads_no_unapproved_mapping(tmp_path: Path) -> None:
    path = tmp_path / "crosswalk.csv"
    path.write_text(
        "source_code,branch_source_code,branch_source_name,sap_card_code,"
        "mapping_status,approval_reference\n",
        encoding="utf-8",
    )
    connection = sqlite3.connect(":memory:")
    connection.execute(
        "CREATE TABLE bridge_source_branch "
        "(a TEXT, b TEXT, c TEXT, d TEXT, e TEXT, f TEXT)"
    )
    assert load_approved_branch_crosswalk(connection, path) == 0


def test_approved_crosswalk_requires_reference(tmp_path: Path) -> None:
    path = tmp_path / "crosswalk.csv"
    path.write_text(
        "source_code,branch_source_code,branch_source_name,sap_card_code,"
        "mapping_status,approval_reference\nDH,B1,Branch,CDH-1,APPROVED,\n",
        encoding="utf-8",
    )
    connection = sqlite3.connect(":memory:")
    with pytest.raises(ValueError):
        load_approved_branch_crosswalk(connection, path)
