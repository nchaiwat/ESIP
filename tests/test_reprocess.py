from __future__ import annotations

import json
from pathlib import Path

from esip.reprocess import file_sha256, reprocess_if_oscn_changed


def _write_oscn_placeholder(root: Path, content: bytes = b"oscn") -> Path:
    path = (
        root
        / "MasterData"
        / "OSCN"
        / "incoming"
        / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx"
    )
    path.parent.mkdir(parents=True)
    path.write_bytes(content)
    return path


def test_first_reprocess_check_records_baseline_without_database(tmp_path: Path) -> None:
    oscn = _write_oscn_placeholder(tmp_path)

    result = reprocess_if_oscn_changed(tmp_path)

    assert result.status == "BASELINE_RECORDED"
    state = json.loads(
        (tmp_path / "config" / "oscn_reprocess_state.json").read_text()
    )
    assert state["current_oscn_sha256"] == file_sha256(oscn)


def test_unchanged_oscn_is_noop(tmp_path: Path) -> None:
    _write_oscn_placeholder(tmp_path)
    reprocess_if_oscn_changed(tmp_path)

    result = reprocess_if_oscn_changed(tmp_path)

    assert result.status == "NO_CHANGE"
    assert result.before is None
    assert result.after is None
