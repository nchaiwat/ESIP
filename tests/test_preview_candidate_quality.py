from pathlib import Path


def test_preview_renders_candidate_quality_gate() -> None:
    script = (
        Path(__file__).resolve().parents[1]
        / "scripts"
        / "build_daily_raw_preview.mjs"
    ).read_text(encoding="utf-8")

    assert "Candidate quality gate:" in script
    assert "data.candidate_quality.passed" in script
