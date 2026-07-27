from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import asdict, dataclass
import json
from pathlib import Path


@dataclass(frozen=True)
class CandidateQuality:
    product_reviewable: int
    branch_high_confidence: int
    issues: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return not self.issues

    def to_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["passed"] = self.passed
        return payload


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def evaluate_candidate_quality(root: Path) -> CandidateQuality:
    operations = root / "output" / "operations"
    products = _read_csv(operations / "product_mapping_queue.csv")
    branches = _read_csv(operations / "branch_mapping_approval_queue.csv")
    issues: list[str] = []

    reviewable = [
        row
        for row in products
        if row.get("candidate_basis")
        in {"EXACT_ITEM_MASTER_BARCODE", "UNIQUE_CROSS_SOURCE_OSCN"}
    ]
    seen_products: set[tuple[str, str]] = set()
    for row in reviewable:
        key = (row.get("source_code", ""), row.get("source_product_code", ""))
        if key in seen_products:
            issues.append(f"Duplicate reviewable product identity: {key[0]} / {key[1]}")
        seen_products.add(key)
        candidates = [
            value
            for value in row.get("candidate_sap_item_codes", "").split("|")
            if value.strip()
        ]
        if len(candidates) != 1:
            issues.append(
                f"Reviewable product must have exactly one candidate: {key[0]} / {key[1]}"
            )

    high_confidence = [
        row
        for row in branches
        if row.get("recommendation") == "HIGH_CONFIDENCE_CANDIDATE"
    ]
    identity_targets: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    code_targets: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in high_confidence:
        source = row.get("source_code", "")
        code = row.get("branch_source_code", "")
        name = row.get("branch_source_name", "")
        target = row.get("candidate_card_code", "").strip()
        if not target:
            issues.append(f"High-confidence branch has a blank target: {source} / {code}")
        try:
            score = float(row.get("similarity_score", "0") or 0)
        except ValueError:
            score = 0
        if score < 0.95:
            issues.append(
                f"High-confidence branch similarity is below 0.95: {source} / {code}"
            )
        identity_targets[(source, code, name)].add(target)
        if code:
            code_targets[(source, code)].add(target)

    for identity, targets in identity_targets.items():
        if len(targets) > 1:
            issues.append(
                "Conflicting high-confidence branch identity: "
                f"{identity[0]} / {identity[1]} / {identity[2]}"
            )
    for key, targets in code_targets.items():
        if len(targets) > 1:
            issues.append(
                f"Conflicting high-confidence branch code: {key[0]} / {key[1]}"
            )

    return CandidateQuality(len(reviewable), len(high_confidence), tuple(issues))


def write_candidate_quality(root: Path, quality: CandidateQuality) -> Path:
    path = root / "output" / "operations" / "mapping_candidate_quality.json"
    path.write_text(
        json.dumps(quality.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path
