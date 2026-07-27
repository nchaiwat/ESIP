import csv
from pathlib import Path

from esip.reporting import coverage_for_dataset


def write_csv(path: Path, headers: list[str], rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows(rows)


def test_coverage_counts_staged_and_quarantine_reasons(tmp_path: Path) -> None:
    write_csv(tmp_path / "dh_canonical_sales.csv", ["id"], [["1"], ["2"]])
    write_csv(
        tmp_path / "dh_quarantine.csv",
        ["reason_code"],
        [["UNMAPPED_PRODUCT"], ["INVALID_ROW"]],
    )
    rows = coverage_for_dataset(tmp_path, "DH", "sales")
    assert {row.quarantine_reason for row in rows} == {"UNMAPPED_PRODUCT", "INVALID_ROW"}
    assert all(row.total_rows == 4 and row.mapping_rate == 0.5 for row in rows)
