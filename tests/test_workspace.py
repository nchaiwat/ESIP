from pathlib import Path

from esip import __version__


def test_version() -> None:
    assert __version__ == "0.1.0"


def test_nontechnical_result_shortcut_exists() -> None:
    root = Path(__file__).resolve().parents[1]
    shortcut = root / "Open_ESIP_Result.cmd"

    assert shortcut.is_file()
    text = shortcut.read_text(encoding="utf-8")
    assert "ESIP_Daily_Raw_Preview.xlsx" in text


def test_operational_shortcuts_guard_required_environment() -> None:
    root = Path(__file__).resolve().parents[1]
    controls = (
        "Run_ESIP_Daily.cmd",
        "Check_ESIP_Approvals.cmd",
        "Apply_ESIP_Approvals.cmd",
        "Check_Publication_Readiness.cmd",
        "Apply_Publication_Approvals.cmd",
        "Reprocess_After_OSCN_Change.cmd",
        "Prepare_HH_Download_Folder.cmd",
    )

    for filename in controls:
        text = (root / filename).read_text(encoding="utf-8")
        assert 'if not exist ".venv\\Scripts\\' in text


def test_main_menu_exposes_only_safe_daily_actions() -> None:
    root = Path(__file__).resolve().parents[1]
    text = (root / "ESIP_Menu.cmd").read_text(encoding="utf-8")

    assert "Run_ESIP_Daily.cmd" in text
    assert "Open_ESIP_Result.cmd" in text
    assert "Check_ESIP_Approvals.cmd" in text
    assert "Check_Publication_Readiness.cmd" in text
    assert "Prepare_HH_Download_Folder.cmd" in text
    assert "Apply_ESIP_Approvals.cmd" not in text
    assert "Apply_Publication_Approvals.cmd" not in text
