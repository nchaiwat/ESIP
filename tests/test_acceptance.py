import json
from pathlib import Path

from esip.acceptance import AcceptanceCheck, write_acceptance_report


def test_acceptance_report_marks_all_pass(tmp_path: Path) -> None:
    path = tmp_path / "acceptance.json"
    write_acceptance_report(
        [AcceptanceCheck("TA-01", "Invariant", "PASS", "evidence")], path
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["overall_status"] == "PASS"


def test_acceptance_report_marks_any_failure(tmp_path: Path) -> None:
    path = tmp_path / "acceptance.json"
    write_acceptance_report(
        [AcceptanceCheck("TA-01", "Invariant", "FAIL", "evidence")], path
    )
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["overall_status"] == "FAIL"
