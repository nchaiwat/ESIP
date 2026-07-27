from datetime import date
from pathlib import Path

import pytest

from esip.wide_ingest import gbh_branch_layout, report_date_from_filename


def test_gbh_layout_handles_wide_first_branch_block() -> None:
    branch_codes = (None,) * 7 + ("GH-003", None, None, None, None, "GH-101")
    branch_names = (None,) * 7 + ("DC2", None, None, None, None, "RE")
    headers = (
        (None,) * 7
        + ("สต็อค ณ ปัจจุบัน", None, "จำนวนขาย", None, "ยอดขายสุทธิ")
        + ("สต็อค ณ ปัจจุบัน", "จำนวนขาย", "ยอดขายสุทธิ")
    )

    assert gbh_branch_layout(branch_codes, branch_names, headers) == [
        ("GH-003", "DC2", 7, 9, 11),
        ("GH-101", "RE", 12, 13, 14),
    ]


def test_gbh_layout_rejects_missing_measure() -> None:
    with pytest.raises(ValueError, match="Incomplete GBH measure block"):
        gbh_branch_layout(("GH-003",), ("DC2",), ("จำนวนขาย",))


def test_report_date_comes_from_gbh_filename() -> None:
    path = Path("Piyawat-2026-07-21-080336.xlsx")
    assert report_date_from_filename(path) == date(2026, 7, 21)
