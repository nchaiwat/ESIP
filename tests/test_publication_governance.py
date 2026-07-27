from pathlib import Path

from openpyxl import Workbook

from esip import publication_governance


def _workbook(path: Path, status: str, reference: str) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Publication Readiness"
    sheet.append(["import_batch_id", "approval_status", "approval_reference"])
    sheet.append(["batch-1", status, reference])
    workbook.save(path)


def _live(readiness: str, reasons: str = "") -> list[dict[str, object]]:
    return [
        {
            "import_batch_id": "batch-1",
            "source_code": "HH",
            "readiness_status": readiness,
            "blocking_reasons": reasons,
        }
    ]


def test_blocked_batch_cannot_be_approved(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "review.xlsx"
    _workbook(path, "APPROVED", "EMAIL-1")
    monkeypatch.setattr(
        publication_governance,
        "publication_rows",
        lambda _root: _live("BLOCKED", "QUARANTINE_NOT_ZERO"),
    )

    result = publication_governance.evaluate_publication_approvals(tmp_path, path)

    assert result.approved == ()
    assert any("QUARANTINE_NOT_ZERO" in issue.message for issue in result.issues)


def test_ready_batch_requires_reference(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "review.xlsx"
    _workbook(path, "APPROVED", "")
    monkeypatch.setattr(
        publication_governance,
        "publication_rows",
        lambda _root: _live("READY_FOR_APPROVAL"),
    )

    result = publication_governance.evaluate_publication_approvals(tmp_path, path)

    assert any("approval_reference" in issue.message for issue in result.issues)


def test_ready_batch_with_reference_passes_check(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "review.xlsx"
    _workbook(path, "APPROVED", "EMAIL-1")
    monkeypatch.setattr(
        publication_governance,
        "publication_rows",
        lambda _root: _live("READY_FOR_APPROVAL"),
    )

    result = publication_governance.evaluate_publication_approvals(tmp_path, path)

    assert result.approved == (("batch-1", "HH", "EMAIL-1"),)
    assert result.issues == ()
