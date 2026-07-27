import importlib.util
from pathlib import Path
import sys


def _module():
    path = Path(__file__).resolve().parents[1] / "scripts" / "export_mapping_work_queues.py"
    spec = importlib.util.spec_from_file_location("mapping_queue_export", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_priority_tiers_follow_cumulative_impact_boundaries() -> None:
    priority = _module()._priority

    assert priority(1, 60, 60, 100)[3] == "P1_FIRST_50_PERCENT"
    assert priority(2, 10, 60, 100)[3] == "P2_NEXT_TO_80_PERCENT"
    assert priority(3, 10, 85, 100)[3] == "P3_NEXT_TO_95_PERCENT"
    assert priority(4, 5, 96, 100)[3] == "P4_REMAINDER"


def test_priority_shares_reconcile_to_total() -> None:
    rank, impact, cumulative, tier = _module()._priority(4, 25, 100, 100)

    assert rank == 4
    assert impact == 0.25
    assert cumulative == 1
    assert tier == "P4_REMAINDER"


def test_exact_barcode_candidates_preserve_only_exact_normalized_matches() -> None:
    candidates = _module()._exact_barcode_candidates(
        [
            ("FA-1", "8859283002230"),
            ("FA-2", " 8859283002230 "),
            ("FA-3", None),
        ]
    )

    assert candidates["8859283002230"] == {"FA-1", "FA-2"}
    assert "" not in candidates


def test_global_oscn_candidates_retain_item_and_evidence_card_codes() -> None:
    module = _module()
    records = [
        module.OscnRecord("FA-1", "CHP-0001", "SKU-1", ""),
        module.OscnRecord("FA-1", "CMH-0001", "SKU-1", ""),
        module.OscnRecord("FA-2", "CDH-0001", "SKU-2", "BAR-2"),
    ]

    candidates = module._global_oscn_candidates(records)

    assert candidates["SKU-1"]["FA-1"] == {"CHP-0001", "CMH-0001"}
    assert candidates["BAR-2"]["FA-2"] == {"CDH-0001"}


def test_unique_branch_name_lookup_requires_one_unambiguous_name() -> None:
    lookup = _module()._unique_branch_name_lookup(
        [
            ("DH", "BN", "", 10),
            ("DH", "BN", "บางนา-ตราด", 20),
            ("DH", "XX", "ชื่อหนึ่ง", 3),
            ("DH", "XX", "ชื่อสอง", 4),
        ]
    )

    assert lookup[("DH", "BN")] == "บางนา-ตราด"
    assert ("DH", "XX") not in lookup
