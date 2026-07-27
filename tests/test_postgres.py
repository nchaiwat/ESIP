from pathlib import Path

import pytest

from esip.master_data import classify_product_family
from esip.postgres import _reference_revision, database_url


def test_product_family_uses_actual_item_code_prefixes() -> None:
    assert classify_product_family("FA001") == "ALUMINIUM"
    assert classify_product_family("fu002") == "UPVC"
    assert classify_product_family("FG003") == "OUT_OF_SCOPE"


def test_database_url_reads_workspace_env(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(
        "ESIP_DATABASE_URL=postgresql://app:secret@localhost:56543/esip\n",
        encoding="utf-8",
    )
    assert database_url(tmp_path).endswith("@localhost:56543/esip")


def test_database_url_requires_configuration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("ESIP_DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="ESIP_DATABASE_URL"):
        database_url(tmp_path)


def test_reference_revision_changes_when_crosswalk_changes(tmp_path: Path) -> None:
    paths = [
        tmp_path / "config" / "source_registry.yaml",
        tmp_path / "config" / "branch_crosswalk.csv",
        tmp_path / "MasterData" / "ItemMaster" / "incoming" / "ItemMaster_FGFU_OITM.xlsx",
        tmp_path / "MasterData" / "BranchMaster" / "incoming" / "ModernTrade_Branch.xlsx",
    ]
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("initial", encoding="utf-8")
    before = _reference_revision(tmp_path)

    paths[1].write_text("approved", encoding="utf-8")

    assert _reference_revision(tmp_path)["branch_crosswalk"] != before["branch_crosswalk"]
