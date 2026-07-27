import json
from pathlib import Path

from esip.governance_backup import create_governance_backup


def test_governance_backup_copies_existing_files_and_records_missing_files(
    tmp_path: Path,
) -> None:
    existing = tmp_path / "config" / "branch_crosswalk.csv"
    existing.parent.mkdir()
    existing.write_text("header\nvalue\n", encoding="utf-8")
    missing = tmp_path / "output" / "missing.csv"
    workbook = tmp_path / "review.xlsx"
    workbook.write_bytes(b"review")

    backup = create_governance_backup(
        tmp_path,
        "MAPPING_APPROVAL",
        [existing, missing],
        workbook_path=workbook,
        data_snapshot={"rows": 1},
    )

    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["operation"] == "MAPPING_APPROVAL"
    assert manifest["data_snapshot"] == {"rows": 1}
    assert manifest["files"][0]["existed"] is True
    assert manifest["files"][1]["existed"] is False
    assert (backup / manifest["files"][0]["backup_path"]).read_text(
        encoding="utf-8"
    ) == "header\nvalue\n"
