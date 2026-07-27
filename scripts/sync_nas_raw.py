from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
from datetime import date, datetime, timedelta
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NAS = r"\\wa-nas-it03\FileShare-2\SaleOut_RPT"
SOURCE_FOLDERS = {
    "DH": "DH",
    "GBH": "GBH",
    "HomeHub": "HH",
    "HP_MH": "HP_MH",
    "TWD": "TWD",
}
ALLOWED_SUFFIXES = (".xlsx", ".xls", ".csv.zip")
LEDGER_PATH = ROOT / "output" / "operations" / "nas_sync_ledger.json"
REPORT_PATH = ROOT / "output" / "operations" / "nas_sync_latest.json"
LEDGER_FLUSH_EVERY = 25


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def text_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def read_json(path: Path, fallback: object) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def progress(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def unique_target(directory: Path, filename: str, folder_date: str) -> Path:
    target = directory / filename
    if not target.exists():
        return target
    suffixes = "".join(target.suffixes)
    base = target.name[: -len(suffixes)] if suffixes else target.name
    dated = directory / f"{base}_{folder_date.replace('-', '')}{suffixes}"
    if not dated.exists():
        return dated
    counter = 2
    while True:
        candidate = directory / f"{base}_{folder_date.replace('-', '')}_{counter}{suffixes}"
        if not candidate.exists():
            return candidate
        counter += 1


def find_existing_hash(directory: Path, expected_hash: str, expected_size: int) -> Path | None:
    if not directory.is_dir():
        return None
    for candidate in directory.iterdir():
        if (
            candidate.is_file()
            and candidate.stat().st_size == expected_size
            and sha256(candidate) == expected_hash
        ):
            return candidate
    return None


def process_esip() -> dict[str, object]:
    request = Request(
        "http://localhost:8090/process",
        data=json.dumps(
            {"trigger": "NAS_AUTO_SYNC", "actor": "ESIP NAS Scheduler"}
        ).encode("utf-8"),
        headers={
            "authorization": "Bearer esip-local-apply-token",
            "content-type": "application/json",
            "x-esip-role": "ADMINISTRATOR",
        },
        method="POST",
    )
    with urlopen(request, timeout=1800) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    nas_root = Path(os.environ.get("ESIP_EXTERNAL_RAW_PATH", DEFAULT_NAS))
    lookback_raw = os.environ.get("ESIP_NAS_LOOKBACK_DAYS", "2").strip().lower()
    sync_all_history = lookback_raw in {"all", "full", "*"}
    lookback = 0 if sync_all_history else max(1, min(int(lookback_raw), 2000))
    if not nas_root.is_dir():
        print(f"FAIL: NAS path is not accessible: {nas_root}")
        return 2

    ledger_raw = read_json(LEDGER_PATH, {"hashes": {}})
    ledger = ledger_raw if isinstance(ledger_raw, dict) else {"hashes": {}}
    hashes = ledger.setdefault("hashes", {})
    if not isinstance(hashes, dict):
        hashes = {}
        ledger["hashes"] = hashes
    source_path_index: dict[str, dict[str, object]] = {}
    for entry in hashes.values():
        if isinstance(entry, dict) and isinstance(entry.get("source_path"), str):
            source_path_index[entry["source_path"]] = entry

    copied: list[dict[str, object]] = []
    skipped = 0
    scanned = 0
    last_flush_copied = 0
    for nas_name, source_code in SOURCE_FOLDERS.items():
        source_root = nas_root / nas_name
        if not source_root.is_dir():
            continue
        if sync_all_history:
            day_dirs = [
                item for item in source_root.iterdir()
                if item.is_dir() and re.fullmatch(r"\d{4}-\d{2}-\d{2}", item.name)
            ]
            day_dirs.sort(key=lambda item: item.name)
        else:
            day_dirs = [
                source_root / (date.today() - timedelta(days=days_ago)).isoformat()
                for days_ago in range(lookback - 1, -1, -1)
            ]
        for day_dir in day_dirs:
            if not day_dir.is_dir():
                continue
            for source_file in sorted(day_dir.iterdir()):
                if not source_file.is_file():
                    continue
                lower_name = source_file.name.lower()
                if not lower_name.endswith(ALLOWED_SUFFIXES):
                    continue
                scanned += 1
                source_path = str(source_file)
                source_stat = source_file.stat()
                indexed = source_path_index.get(source_path)
                if indexed is not None:
                    indexed_size = indexed.get("source_size")
                    indexed_mtime = indexed.get("source_mtime")
                    can_fast_skip = (
                        indexed_size == source_stat.st_size
                        and indexed_mtime == source_stat.st_mtime
                    ) or (
                        sync_all_history
                        and (ROOT / str(indexed.get("destination", ""))).exists()
                    )
                    if can_fast_skip:
                        skipped += 1
                        continue
                if sync_all_history:
                    destination_dir = ROOT / "SourceFiles" / source_code / "incoming"
                    destination_dir.mkdir(parents=True, exist_ok=True)
                    destination = unique_target(destination_dir, source_file.name, day_dir.name)
                    shutil.copy2(source_file, destination)
                    file_hash = sha256(destination)
                    ledger_key = f"{source_code}|path|{text_hash(source_path)}"
                    hashes[ledger_key] = {
                        "source_path": source_path,
                        "source_size": source_stat.st_size,
                        "source_mtime": source_stat.st_mtime,
                        "destination": str(destination.relative_to(ROOT)),
                        "sha256": file_hash,
                        "copied_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                    }
                    source_path_index[source_path] = hashes[ledger_key]
                    copied.append(
                        {
                            "source": source_code,
                            "filename": source_file.name,
                            "destination": str(destination.relative_to(ROOT)),
                            "sha256": file_hash,
                            "size": source_stat.st_size,
                        }
                    )
                    if len(copied) - last_flush_copied >= LEDGER_FLUSH_EVERY:
                        write_json(LEDGER_PATH, ledger)
                        last_flush_copied = len(copied)
                        progress(
                            f"progress scanned={scanned} copied={len(copied)} skipped={skipped} source={source_code}"
                        )
                    continue
                file_hash = sha256(source_file)
                ledger_key = f"{source_code}|{file_hash}"
                if ledger_key in hashes:
                    if isinstance(hashes[ledger_key], dict):
                        hashes[ledger_key]["source_size"] = source_stat.st_size
                        hashes[ledger_key]["source_mtime"] = source_stat.st_mtime
                    source_path_index[source_path] = hashes[ledger_key]
                    skipped += 1
                    continue
                destination_dir = ROOT / "SourceFiles" / source_code / "incoming"
                destination_dir.mkdir(parents=True, exist_ok=True)
                existing = find_existing_hash(
                    destination_dir, file_hash, source_stat.st_size
                )
                if existing is not None:
                    hashes[ledger_key] = {
                        "source_path": source_path,
                        "source_size": source_stat.st_size,
                        "source_mtime": source_stat.st_mtime,
                        "destination": str(existing.relative_to(ROOT)),
                        "copied_at": "ALREADY_PRESENT",
                    }
                    source_path_index[source_path] = hashes[ledger_key]
                    skipped += 1
                    continue
                destination = unique_target(destination_dir, source_file.name, day_dir.name)
                shutil.copy2(source_file, destination)
                if sha256(destination) != file_hash:
                    destination.unlink(missing_ok=True)
                    raise RuntimeError(f"Hash verification failed: {source_file}")
                hashes[ledger_key] = {
                    "source_path": source_path,
                    "source_size": source_stat.st_size,
                    "source_mtime": source_stat.st_mtime,
                    "destination": str(destination.relative_to(ROOT)),
                    "copied_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                }
                source_path_index[source_path] = hashes[ledger_key]
                copied.append(
                    {
                        "source": source_code,
                        "filename": source_file.name,
                        "destination": str(destination.relative_to(ROOT)),
                        "sha256": file_hash,
                        "size": source_stat.st_size,
                    }
                )
                if len(copied) - last_flush_copied >= LEDGER_FLUSH_EVERY:
                    write_json(LEDGER_PATH, ledger)
                    last_flush_copied = len(copied)
                    progress(
                        f"progress scanned={scanned} copied={len(copied)} skipped={skipped} source={source_code}"
                    )

    write_json(LEDGER_PATH, ledger)
    report: dict[str, object] = {
        "status": "COPIED" if copied else "NO_NEW_FILES",
        "nas_path": str(nas_root),
        "lookback_days": "all" if sync_all_history else lookback,
        "copied_count": len(copied),
        "skipped_count": skipped,
        "files": copied,
        "finished_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    if copied:
        report["process"] = process_esip()
    write_json(REPORT_PATH, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
