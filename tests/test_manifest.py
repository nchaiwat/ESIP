from __future__ import annotations

import csv
from pathlib import Path

from esip.manifest import load_manifest, refresh_manifest, sha256_file, verify_manifest


def test_verify_manifest_accepts_unchanged_file(tmp_path: Path) -> None:
    source = tmp_path / "sample.csv"
    source.write_text("sku,qty\nA,1\n", encoding="utf-8")
    manifest = tmp_path / "manifest.csv"
    with manifest.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=["relative_path", "size_bytes", "sha256", "status", "recorded_at"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "relative_path": "sample.csv",
                "size_bytes": source.stat().st_size,
                "sha256": sha256_file(source),
                "status": "placed",
                "recorded_at": "2026-07-22",
            }
        )

    check = verify_manifest(tmp_path, manifest)[0]
    assert check.is_valid


def test_verify_manifest_detects_changed_file(tmp_path: Path) -> None:
    source = tmp_path / "sample.csv"
    source.write_text("original", encoding="utf-8")
    digest = sha256_file(source)
    manifest = tmp_path / "manifest.csv"
    manifest.write_text(
        "relative_path,size_bytes,sha256,status,recorded_at\n"
        f"sample.csv,{source.stat().st_size},{digest},placed,2026-07-22\n",
        encoding="utf-8",
    )
    source.write_text("modified", encoding="utf-8")

    check = verify_manifest(tmp_path, manifest)[0]
    assert not check.is_valid
    assert not check.hash_matches


def test_refresh_manifest_discovers_incoming_files_only(tmp_path: Path) -> None:
    source = tmp_path / "SourceFiles" / "HH" / "incoming" / "SaleReport.xlsx"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"daily")
    ignored = tmp_path / "SourceFiles" / "HH" / "archive" / "old.xlsx"
    ignored.parent.mkdir(parents=True)
    ignored.write_bytes(b"old")
    master = tmp_path / "MasterData" / "ItemMaster" / "incoming" / "items.xlsx"
    master.parent.mkdir(parents=True)
    master.write_bytes(b"master")
    manifest = tmp_path / "SourceFiles" / "source_manifest.csv"

    assert refresh_manifest(tmp_path, manifest, "2026-07-23") == 2

    entries = load_manifest(manifest)
    assert [entry.relative_path for entry in entries] == [
        "MasterData/ItemMaster/incoming/items.xlsx",
        "SourceFiles/HH/incoming/SaleReport.xlsx",
    ]
    assert all(entry.recorded_at == "2026-07-23" for entry in entries)
