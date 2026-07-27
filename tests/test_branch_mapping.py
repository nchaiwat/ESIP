from esip.branch_mapping import SourceBranch, branch_similarity, rank_branch_candidates
from esip.master_data import BranchMasterRecord


def test_branch_similarity_prefers_contained_branch_name() -> None:
    assert branch_similarity("Lampang Branch", "Company Limited (Lampang Branch)") == 0.95


def test_high_confidence_candidate_requires_score_and_margin() -> None:
    source = SourceBranch("TWD", "60923", "Lampang Branch")
    master = [
        BranchMasterRecord("CTW-1", "Company Limited (Lampang Branch)"),
        BranchMasterRecord("CTW-2", "Company Limited (Bangkok Branch)"),
    ]
    candidates = rank_branch_candidates(source, master, "CTW")
    assert candidates[0].card_code == "CTW-1"
    assert candidates[0].recommendation == "HIGH_CONFIDENCE_CANDIDATE"


def test_rank_branch_candidates_handles_unconfigured_master_prefix() -> None:
    source = SourceBranch("TA", "", "Thai Aus")
    master = [BranchMasterRecord("CTW-1", "Thai Watsadu")]

    assert rank_branch_candidates(source, master, "COT-0165") == []
