from __future__ import annotations

import csv
from pathlib import Path

from esip.candidate_quality import evaluate_candidate_quality


def _write(path: Path, headers: list[str], rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows(rows)


def test_candidate_quality_accepts_unique_evidence_backed_candidates(
    tmp_path: Path,
) -> None:
    operations = tmp_path / "output" / "operations"
    _write(
        operations / "product_mapping_queue.csv",
        [
            "source_code",
            "source_product_code",
            "candidate_basis",
            "candidate_sap_item_codes",
        ],
        [["MH", "SKU1", "UNIQUE_CROSS_SOURCE_OSCN", "ITEM1"]],
    )
    _write(
        operations / "branch_mapping_approval_queue.csv",
        [
            "source_code",
            "branch_source_code",
            "branch_source_name",
            "candidate_card_code",
            "similarity_score",
            "recommendation",
        ],
        [["MH", "B1", "Branch", "CMH-1", "1.0", "HIGH_CONFIDENCE_CANDIDATE"]],
    )

    result = evaluate_candidate_quality(tmp_path)

    assert result.passed
    assert result.product_reviewable == 1
    assert result.branch_high_confidence == 1


def test_candidate_quality_rejects_conflicting_branch_code(tmp_path: Path) -> None:
    operations = tmp_path / "output" / "operations"
    _write(
        operations / "product_mapping_queue.csv",
        [
            "source_code",
            "source_product_code",
            "candidate_basis",
            "candidate_sap_item_codes",
        ],
        [],
    )
    _write(
        operations / "branch_mapping_approval_queue.csv",
        [
            "source_code",
            "branch_source_code",
            "branch_source_name",
            "candidate_card_code",
            "similarity_score",
            "recommendation",
        ],
        [
            ["MH", "B1", "One", "CMH-1", "1.0", "HIGH_CONFIDENCE_CANDIDATE"],
            ["MH", "B1", "Two", "CMH-2", "1.0", "HIGH_CONFIDENCE_CANDIDATE"],
        ],
    )

    result = evaluate_candidate_quality(tmp_path)

    assert not result.passed
    assert any("Conflicting high-confidence branch code" in issue for issue in result.issues)
