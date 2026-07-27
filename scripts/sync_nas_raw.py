from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path, fallback: object) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


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
    lookback = max(1, min(int(os.environ.get("ESIP_NAS_LOOKBACK_DAYS", "2")), 90))
    if not nas_root.is_dir():
        print(f"FAIL: NAS path is not accessible: {nas_root}")
        return 2

    ledger_raw = read_json(LEDGER_PATH, {"hashes": {}})
    ledger = ledger_raw if isinstance(ledger_raw, dict) else {"hashes": {}}
    hashes = ledger.setdefault("hashes", {})
    if not isinstance(hashes, dict):
        hashes = {}
        ledger["hashes"] = hashes

    copied: list[dict[str, object]] = []
    skipped = 0
    for nas_name, source_code in SOURCE_FOLDERS.items():
        source_root = nas_root / nas_name
        if not source_root.is_dir():
            continue
        for days_ago in range(lookback - 1, -1, -1):
            folder_date = date.today() - timedelta(days=days_ago)
            day_dir = source_root / folder_date.isoformat()
            if not day_dir.is_dir():
                continue
            for source_file in sorted(day_dir.iterdir()):
                if not source_file.is_file():
                    continue
                lower_name = source_file.name.lower()
                if not lower_name.endswith(ALLOWED_SUFFIXES):
                    continue
                file_hash = sha256(source_file)
                ledger_key = f"{source_code}|{file_hash}"
                if ledger_key in hashes:
                    skipped += 1
                    continue
                destination_dir = ROOT / "SourceFiles" / source_code / "incoming"
                destination_dir.mkdir(parents=True, exist_ok=True)
                existing = find_existing_hash(
                    destination_dir, file_hash, source_file.stat().st_size
                )
                if existing is not None:
                    hashes[ledger_key] = {
                        "source_path": str(source_file),
                        "destination": str(existing.relative_to(ROOT)),
                        "copied_at": "ALREADY_PRESENT",
                    }
                    skipped += 1
                    continue
                destination = unique_target(destination_dir, source_file.name, day_dir.name)
                shutil.copy2(source_file, destination)
                if sha256(destination) != file_hash:
                    destination.unlink(missing_ok=True)
                    raise RuntimeError(f"Hash verification failed: {source_file}")
                hashes[ledger_key] = {
                    "source_path": str(source_file),
                    "destination": str(destination.relative_to(ROOT)),
                    "copied_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                }
                copied.append(
                    {
                        "source": source_code,
                        "filename": source_file.name,
                        "destination": str(destination.relative_to(ROOT)),
                        "sha256": file_hash,
                        "size": source_file.stat().st_size,
                    }
                )

    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    LEDGER_PATH.write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report: dict[str, object] = {
        "status": "COPIED" if copied else "NO_NEW_FILES",
        "nas_path": str(nas_root),
        "lookback_days": lookback,
        "copied_count": len(copied),
        "skipped_count": skipped,
        "files": copied,
        "finished_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    if copied:
        report["process"] = process_esip()
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
