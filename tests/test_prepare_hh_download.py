from datetime import date
from pathlib import Path

from scripts.prepare_hh_download import prepare_hh_folder


def test_prepare_hh_folder_uses_iso_date_without_touching_existing_history(
    tmp_path: Path,
) -> None:
    prior = tmp_path / "SourceFiles" / "HH" / "incoming" / "2026-07-22"
    prior.mkdir(parents=True)
    marker = prior / "SaleReport.xlsx"
    marker.write_bytes(b"prior")

    prepared = prepare_hh_folder(tmp_path, date(2026, 7, 23))

    assert prepared == (
        tmp_path / "SourceFiles" / "HH" / "incoming" / "2026-07-23"
    ).resolve()
    assert prepared.is_dir()
    assert marker.read_bytes() == b"prior"
