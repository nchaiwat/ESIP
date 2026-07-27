from pathlib import Path

from openpyxl import Workbook

from esip.master_data import (
    load_branch_master,
    load_oscn,
    normalize_identifier,
    write_oscn_ambiguity_report,
)


def save_book(path: Path, title: str, rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = title
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def test_identifier_normalization_does_not_add_decimal_suffix() -> None:
    assert normalize_identifier(123.0) == "123"
    assert normalize_identifier(" 00123 ") == "00123"


def test_branch_loader_reports_duplicate_and_blank_keys(tmp_path: Path) -> None:
    path = tmp_path / "branches.xlsx"
    save_book(path, "Sheet1", [["BP Code", "BP Name"], ["CDH01", "A"], ["CDH01", "A2"], [None, "B"]])
    records, diagnostics = load_branch_master(path)
    assert len(records) == 2
    assert diagnostics.duplicate_keys == (("CDH01",),)
    assert diagnostics.blank_key_rows == (4,)


def test_oscn_duplicate_key_means_ambiguous_customer_sku(tmp_path: Path) -> None:
    path = tmp_path / "oscn.xlsx"
    save_book(
        path,
        "AllOSCN",
        [
            ["Item No.", "BP Code", "BP Catalog Number", "Partner Barcode"],
            ["I1", "CTW01", "SKU1", "B1"],
            ["I2", "CTW01", "SKU1", "B2"],
        ],
    )
    records, diagnostics = load_oscn(path)
    assert len(records) == 2
    assert diagnostics.duplicate_keys == (("CTW01", "SKU1"),)
    assert diagnostics.ambiguous_keys == (("CTW01", "SKU1"),)
    report = tmp_path / "report.csv"
    assert write_oscn_ambiguity_report(records, report) == 1
    assert "I1|I2" in report.read_text(encoding="utf-8-sig")
