from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


def _module():
    path = Path(__file__).resolve().parents[1] / "scripts" / "export_preview_data.py"
    spec = importlib.util.spec_from_file_location("export_preview_data", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_product_review_queue_puts_evidence_backed_rows_first() -> None:
    module = _module()
    rows = [
        {
            "candidate_basis": "NO_EXACT_CANDIDATE",
            "total_affected_rows": "1000",
            "priority_rank": "1",
        },
        {
            "candidate_basis": "UNIQUE_CROSS_SOURCE_OSCN",
            "total_affected_rows": "10",
            "priority_rank": "50",
        },
        {
            "candidate_basis": "EXACT_ITEM_MASTER_BARCODE",
            "total_affected_rows": "5",
            "priority_rank": "100",
        },
    ]

    result = module._sort_product_review_queue(rows)

    assert [row["candidate_basis"] for row in result] == [
        "EXACT_ITEM_MASTER_BARCODE",
        "UNIQUE_CROSS_SOURCE_OSCN",
        "NO_EXACT_CANDIDATE",
    ]


def test_branch_review_queue_puts_high_confidence_rows_first() -> None:
    module = _module()
    rows = [
        {
            "recommendation": "MANUAL_REVIEW",
            "candidate_basis": "SOURCE_BRANCH_NAME",
            "affected_rows": "1000",
            "priority_rank": "1",
        },
        {
            "recommendation": "HIGH_CONFIDENCE_CANDIDATE",
            "candidate_basis": "SAME_CODE_NAME_ENRICHMENT",
            "affected_rows": "10",
            "priority_rank": "50",
        },
    ]

    result = module._sort_branch_review_queue(rows)

    assert result[0]["recommendation"] == "HIGH_CONFIDENCE_CANDIDATE"
