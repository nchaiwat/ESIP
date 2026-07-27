from __future__ import annotations

from datetime import datetime
import hashlib
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    quarantine = ROOT / "output" / "quarantine" / "nas_sync_duplicates" / stamp
    moved = 0
    for source_dir in sorted((ROOT / "SourceFiles").iterdir()):
        incoming = source_dir / "incoming"
        if not incoming.is_dir():
            continue
        groups: dict[tuple[int, str], list[Path]] = {}
        for path in incoming.iterdir():
            if path.is_file():
                groups.setdefault((path.stat().st_size, sha256(path)), []).append(path)
        for paths in groups.values():
            if len(paths) < 2:
                continue
            paths.sort(key=lambda item: (len(item.name), item.name))
            for duplicate in paths[1:]:
                target_dir = quarantine / source_dir.name
                target_dir.mkdir(parents=True, exist_ok=True)
                target = target_dir / duplicate.name
                counter = 2
                while target.exists():
                    target = target_dir / f"{duplicate.stem}_{counter}{duplicate.suffix}"
                    counter += 1
                shutil.move(str(duplicate), str(target))
                moved += 1
    print(f"Quarantined exact duplicate files: {moved}")
    if moved == 0 and quarantine.is_dir():
        quarantine.rmdir()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
