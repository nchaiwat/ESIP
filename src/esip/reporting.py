from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CoverageRow:
    dataset: str
    source_code: str
    total_rows: int
    staged_rows: int
    quarantined_rows: int
    mapping_rate: float
    quarantine_reason: str
    reason_rows: int


def count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return sum(1 for _ in csv.DictReader(stream))


def coverage_for_dataset(
    output_dir: Path, source_code: str, dataset: str
) -> list[CoverageRow]:
    prefix = source_code.lower()
    if dataset == "sales":
        staged_path = output_dir / f"{prefix}_canonical_sales.csv"
        quarantine_path = output_dir / f"{prefix}_quarantine.csv"
    else:
        staged_path = output_dir / f"{prefix}_canonical_inventory.csv"
        quarantine_path = output_dir / f"{prefix}_inventory_quarantine.csv"
    staged = count_csv_rows(staged_path)
    with quarantine_path.open("r", encoding="utf-8-sig", newline="") as stream:
        reasons = Counter(row["reason_code"] for row in csv.DictReader(stream))
    quarantined = sum(reasons.values())
    total = staged + quarantined
    rate = staged / total if total else 0.0
    if not reasons:
        return [CoverageRow(dataset, source_code, total, staged, 0, rate, "", 0)]
    return [
        CoverageRow(dataset, source_code, total, staged, quarantined, rate, reason, count)
        for reason, count in sorted(reasons.items())
    ]


def write_mapping_coverage(rows: list[CoverageRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(CoverageRow.__dataclass_fields__))
        writer.writeheader()
        for row in rows:
            writer.writerow({field: getattr(row, field) for field in row.__dataclass_fields__})
