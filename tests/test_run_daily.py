from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

from openpyxl import Workbook


def _module():
    path = Path(__file__).resolve().parents[1] / "scripts" / "run_daily.py"
    spec = importlib.util.spec_from_file_location("run_daily", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_preview_validation_requires_all_operational_sheets(tmp_path: Path) -> None:
    module = _module()
    workbook = Workbook()
    workbook.active.title = "Dashboard"
    path = tmp_path / "preview.xlsx"
    workbook.save(path)

    valid, message = module._preview_is_valid(path)

    assert not valid
    assert "missing sheets" in message


def test_preview_contract_includes_input_freshness() -> None:
    module = _module()

    assert "Input Freshness" in module.EXPECTED_PREVIEW_SHEETS


def test_preview_contract_includes_daily_action_list() -> None:
    module = _module()

    assert "Daily Action List" in module.EXPECTED_PREVIEW_SHEETS


def test_preview_contract_includes_input_file_safety() -> None:
    module = _module()

    assert "Input File Safety" in module.EXPECTED_PREVIEW_SHEETS


def test_preview_contract_includes_manual_report_coverage() -> None:
    module = _module()

    assert "Manual Report Coverage" in module.EXPECTED_PREVIEW_SHEETS


def test_daily_report_records_failed_step(tmp_path: Path) -> None:
    module = _module()
    step = module.StepResult("Check", "FAIL", 1, "problem")
    report = module._write_report(
        tmp_path,
        "20260723_120000",
        "2026-07-23T12:00:00+07:00",
        "2026-07-23T12:01:00+07:00",
        [step],
        None,
        None,
    )

    payload = json.loads((tmp_path / "output" / "daily_runs" / "latest_run.json").read_text())
    assert payload["overall_status"] == "FAIL"
    assert report.is_file()


def test_retention_keeps_only_newest_matching_files(tmp_path: Path) -> None:
    module = _module()
    archive = tmp_path / "archive"
    archive.mkdir()
    for index in range(5):
        path = archive / f"preview_{index}.xlsx"
        path.write_text(str(index), encoding="utf-8")
        path.touch()

    removed = module._prune_old_files(archive, "preview_*.xlsx", 3)

    assert removed == 2
    assert len(list(archive.glob("preview_*.xlsx"))) == 3
