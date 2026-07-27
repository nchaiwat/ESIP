from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ManifestEntry:
    relative_path: str
    size_bytes: int
    sha256: str
    status: str
    recorded_at: str


@dataclass(frozen=True)
class ManifestCheck:
    entry: ManifestEntry
    exists: bool
    size_matches: bool
    hash_matches: bool

    @property
    def is_valid(self) -> bool:
        return self.exists and self.size_matches and self.hash_matches


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def load_manifest(path: Path) -> list[ManifestEntry]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return [
            ManifestEntry(
                relative_path=row["relative_path"],
                size_bytes=int(row["size_bytes"]),
                sha256=row["sha256"].upper(),
                status=row["status"],
                recorded_at=row["recorded_at"],
            )
            for row in csv.DictReader(stream)
        ]


def verify_manifest(workspace: Path, manifest_path: Path) -> list[ManifestCheck]:
    checks: list[ManifestCheck] = []
    for entry in load_manifest(manifest_path):
        target = workspace / Path(entry.relative_path.replace("\\", "/"))
        exists = target.is_file()
        size_matches = exists and target.stat().st_size == entry.size_bytes
        hash_matches = exists and sha256_file(target) == entry.sha256
        checks.append(ManifestCheck(entry, exists, size_matches, hash_matches))
    return checks


def refresh_manifest(workspace: Path, manifest_path: Path, recorded_at: str) -> int:
    existing = {
        entry.relative_path.replace("\\", "/"): entry
        for entry in load_manifest(manifest_path)
    } if manifest_path.is_file() else {}
    candidates = [
        path
        for base in (workspace / "SourceFiles", workspace / "MasterData")
        for path in base.rglob("*")
        if path.is_file()
        and path.name != ".gitkeep"
        and "incoming" in path.relative_to(base).parts
    ]
    entries: list[ManifestEntry] = []
    for path in sorted(candidates, key=lambda item: item.as_posix().casefold()):
        relative_path = path.relative_to(workspace).as_posix()
        digest = sha256_file(path)
        previous = existing.get(relative_path)
        entries.append(
            ManifestEntry(
                relative_path=relative_path,
                size_bytes=path.stat().st_size,
                sha256=digest,
                status="placed",
                recorded_at=(
                    previous.recorded_at
                    if previous and previous.sha256 == digest
                    else recorded_at
                ),
            )
        )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["relative_path", "size_bytes", "sha256", "status", "recorded_at"])
        for entry in entries:
            writer.writerow(
                [
                    entry.relative_path,
                    entry.size_bytes,
                    entry.sha256,
                    entry.status,
                    entry.recorded_at,
                ]
            )
    return len(entries)
