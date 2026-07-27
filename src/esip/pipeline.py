from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from time import perf_counter
from typing import Callable


@dataclass(frozen=True)
class PipelineStep:
    name: str
    action: Callable[[], int]
    critical: bool = True
    nonzero_status: str = "FAIL"


@dataclass(frozen=True)
class PipelineStepResult:
    name: str
    status: str
    exit_code: int
    elapsed_seconds: float
    error: str = ""


def run_pipeline(steps: list[PipelineStep]) -> list[PipelineStepResult]:
    results: list[PipelineStepResult] = []
    critical_failed = False
    for step in steps:
        if critical_failed:
            results.append(PipelineStepResult(step.name, "SKIPPED", -1, 0.0))
            continue
        started = perf_counter()
        try:
            exit_code = step.action()
            status = "PASS" if exit_code == 0 else step.nonzero_status
            error = ""
        except Exception as exc:  # pipeline boundary records the failing step
            exit_code = 1
            status = "FAIL"
            error = f"{type(exc).__name__}: {exc}"
        elapsed = round(perf_counter() - started, 3)
        results.append(PipelineStepResult(step.name, status, exit_code, elapsed, error))
        if step.critical and status == "FAIL":
            critical_failed = True
    return results


def write_pipeline_report(results: list[PipelineStepResult], path: Path) -> None:
    payload = {
        "technical_status": (
            "PASS" if not any(result.status == "FAIL" for result in results) else "FAIL"
        ),
        "business_status": (
            "WAITING"
            if any(result.status in {"BUSINESS_WAITING", "REVIEW_REQUIRED"} for result in results)
            else "READY"
        ),
        "steps": [asdict(result) for result in results],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
