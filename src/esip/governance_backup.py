from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_governance_backup(
    root: Path,
    operation: str,
    paths: Iterable[Path],
    *,
    workbook_path: Path | None = None,
    data_snapshot: dict[str, Any] | None = None,
) -> Path:
    created = datetime.now(timezone.utc)
    backup_dir = (
        root
        / "output"
        / "governance_backups"
        / f"{created.strftime('%Y%m%d_%H%M%S_%f')}_{operation.casefold()}"
    )
    files_dir = backup_dir / "files"
    files_dir.mkdir(parents=True, exist_ok=False)
    file_records: list[dict[str, object]] = []
    for index, path in enumerate(paths, start=1):
        resolved = path.resolve()
        exists = resolved.is_file()
        backup_name = f"{index:02d}_{resolved.name}"
        if exists:
            shutil.copy2(resolved, files_dir / backup_name)
        try:
            source_label = resolved.relative_to(root.resolve()).as_posix()
        except ValueError:
            source_label = str(resolved)
        file_records.append(
            {
                "source_path": source_label,
                "existed": exists,
                "sha256": _sha256(resolved) if exists else None,
                "backup_path": f"files/{backup_name}" if exists else None,
            }
        )
    workbook_record = None
    if workbook_path is not None:
        workbook = workbook_path.resolve()
        workbook_record = {
            "path": str(workbook),
            "sha256": _sha256(workbook) if workbook.is_file() else None,
        }
    manifest = {
        "created_at_utc": created.isoformat(timespec="microseconds"),
        "operation": operation,
        "workbook": workbook_record,
        "files": file_records,
        "data_snapshot": data_snapshot or {},
    }
    (backup_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return backup_dir
