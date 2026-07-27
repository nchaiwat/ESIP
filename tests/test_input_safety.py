from pathlib import Path

from esip.input_safety import evaluate_input_file_safety


def test_hh_undated_latest_files_are_flagged(tmp_path: Path) -> None:
    incoming = tmp_path / "SourceFiles" / "HH" / "incoming"
    dated = incoming / "2026-07-22"
    dated.mkdir(parents=True)
    (dated / "SaleReport.xlsx").write_bytes(b"old")
    (incoming / "SaleReport.xlsx").write_bytes(b"latest")

    hh = next(
        row for row in evaluate_input_file_safety(tmp_path) if row["source_code"] == "HH"
    )

    assert hh["status"] == "ATTENTION_UNDATED_FILES"
    assert hh["undated_file_count"] == 1
    assert hh["undated_files"] == "SaleReport.xlsx"


def test_duplicate_content_is_reported_without_deleting_files(tmp_path: Path) -> None:
    incoming = tmp_path / "SourceFiles" / "DH" / "incoming"
    incoming.mkdir(parents=True)
    first = incoming / "sales_20260722.xlsx"
    second = incoming / "sales_copy_20260723.xlsx"
    first.write_bytes(b"same-content")
    second.write_bytes(b"same-content")

    dh = next(
        row for row in evaluate_input_file_safety(tmp_path) if row["source_code"] == "DH"
    )

    assert dh["duplicate_group_count"] == 1
    assert dh["duplicate_file_count"] == 2
    assert dh["duplicate_status"] == "ATTENTION_DUPLICATE_CONTENT"
    assert first.is_file() and second.is_file()
