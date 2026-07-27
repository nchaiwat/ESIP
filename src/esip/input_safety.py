from __future__ import annotations

import re
from collections import defaultdict
from os import getenv
from pathlib import Path

from esip.manifest import sha256_file


SOURCE_FOLDERS = (
    ("DH", Path("SourceFiles/DH/incoming")),
    ("GBH", Path("SourceFiles/GBH/incoming")),
    ("HH", Path("SourceFiles/HH/incoming")),
    ("HP/MH", Path("SourceFiles/HP_MH/incoming")),
    ("TWD", Path("SourceFiles/TWD/incoming")),
    ("TA", Path("SourceFiles/TA/incoming")),
)
DATA_SUFFIXES = {".xlsx", ".xls", ".csv", ".zip"}
DEFAULT_MAX_HASH_FILES = 300
DATE_PATTERN = re.compile(
    r"(?:20\d{2}[-_]?\d{2}[-_]?\d{2}|\d{2}[-_]\d{2}[-_]20\d{2}|\d{8})"
)
GUID_PATTERN = re.compile(
    r"^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$",
    re.IGNORECASE,
)


def _is_dated(path: Path, incoming: Path) -> bool:
    relative = path.relative_to(incoming).as_posix()
    return bool(DATE_PATTERN.search(relative))


def evaluate_input_file_safety(root: Path) -> list[dict[str, object]]:
    max_hash_files = int(
        getenv("ESIP_INPUT_SAFETY_MAX_HASH_FILES", str(DEFAULT_MAX_HASH_FILES))
    )
    results: list[dict[str, object]] = []
    for source_code, relative_folder in SOURCE_FOLDERS:
        incoming = root / relative_folder
        files = sorted(
            (
                path
                for path in incoming.rglob("*")
                if path.is_file()
                and (
                    path.suffix.casefold() in DATA_SUFFIXES
                    or path.name.casefold().endswith(".csv.zip")
                )
            ),
            key=lambda path: path.as_posix().casefold(),
        )
        undated = [path for path in files if not _is_dated(path, incoming)]
        duplicate_scan_skipped = len(files) > max_hash_files
        hashes: dict[str, list[Path]] = defaultdict(list)
        if not duplicate_scan_skipped:
            for path in files:
                hashes[sha256_file(path)].append(path)
        duplicate_groups = [paths for paths in hashes.values() if len(paths) > 1]
        duplicate_files = [path for paths in duplicate_groups for path in paths]
        if not files:
            status = "WAITING_FOR_FIRST_DAILY_RAW"
            recommendation = "PROVIDE_FIRST_FILES"
        elif not undated:
            status = "SAFE_DATED_HISTORY"
            recommendation = "KEEP_CURRENT_CONVENTION"
        elif source_code == "TWD" and all(GUID_PATTERN.fullmatch(path.stem) for path in files):
            status = "SAFE_UNIQUE_GENERATED_NAMES"
            recommendation = "KEEP_CURRENT_CONVENTION"
        else:
            status = "ATTENTION_UNDATED_FILES"
            recommendation = "USE_DATED_FOLDER_OR_DOWNLOAD_DATE_SUFFIX"
        results.append(
            {
                "source_code": source_code,
                "file_count": len(files),
                "dated_or_unique_file_count": len(files) - len(undated)
                if status != "SAFE_UNIQUE_GENERATED_NAMES"
                else len(files),
                "undated_file_count": len(undated)
                if status != "SAFE_UNIQUE_GENERATED_NAMES"
                else 0,
                "status": status,
                "recommendation": recommendation,
                "undated_files": "|".join(path.name for path in undated[:10])
                if status == "ATTENTION_UNDATED_FILES"
                else "",
                "duplicate_group_count": len(duplicate_groups),
                "duplicate_file_count": len(duplicate_files),
                "duplicate_status": (
                    "DUPLICATE_SCAN_SKIPPED_LARGE_HISTORY"
                    if duplicate_scan_skipped
                    else (
                        "ATTENTION_DUPLICATE_CONTENT"
                        if duplicate_groups
                        else "NO_DUPLICATE_CONTENT"
                    )
                ),
                "duplicate_files": "|".join(
                    path.relative_to(incoming).as_posix() for path in duplicate_files[:10]
                ),
            }
        )
    return results
