from pathlib import Path
import sys

import pytest

from esip.cli import main
from esip.cli import show_status


def test_status_reports_daily_raw_as_active_workflow(capsys) -> None:
    root = Path(__file__).resolve().parents[1]

    assert show_status(root) == 0

    output = capsys.readouterr().out
    assert "Daily Raw:" in output
    assert "SAP Master Data: 3 files verified" in output
    assert "Active workflow: Daily Raw to PostgreSQL" in output
    assert "Daily raw downloads: waiting" not in output


def test_legacy_kpi_command_is_not_available(monkeypatch, capsys) -> None:
    monkeypatch.setattr(sys, "argv", ["esip", "stage-kpi"])

    with pytest.raises(SystemExit) as error:
        main()

    assert error.value.code == 2
    assert "stage-kpi" not in capsys.readouterr().err.split("choose from", 1)[-1]
