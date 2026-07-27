import json
from pathlib import Path

from esip.pipeline import PipelineStep, run_pipeline, write_pipeline_report


def test_critical_failure_skips_following_steps() -> None:
    called = False

    def should_not_run() -> int:
        nonlocal called
        called = True
        return 0

    results = run_pipeline(
        [PipelineStep("fail", lambda: 1), PipelineStep("skipped", should_not_run)]
    )
    assert [result.status for result in results] == ["FAIL", "SKIPPED"]
    assert not called


def test_business_waiting_does_not_fail_technical_pipeline(tmp_path: Path) -> None:
    results = run_pipeline(
        [
            PipelineStep("technical", lambda: 0),
            PipelineStep(
                "readiness",
                lambda: 1,
                critical=False,
                nonzero_status="BUSINESS_WAITING",
            ),
        ]
    )
    path = tmp_path / "pipeline.json"
    write_pipeline_report(results, path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["technical_status"] == "PASS"
    assert payload["business_status"] == "WAITING"


def test_pipeline_records_exceptions() -> None:
    def broken() -> int:
        raise ValueError("boom")

    result = run_pipeline([PipelineStep("broken", broken)])[0]
    assert result.status == "FAIL"
    assert "ValueError: boom" in result.error
