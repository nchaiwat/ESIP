from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass(frozen=True)
class PublishDecision:
    import_batch_id: str
    eligible: bool
    reasons: tuple[str, ...]


def evaluate_publish_eligibility(
    connection: sqlite3.Connection, import_batch_id: str
) -> PublishDecision:
    row = connection.execute(
        "SELECT status, input_classification, profile_status, branch_mapping_status, "
        "approval_reference, all_reconciliations_passed "
        "FROM vw_batch_health WHERE import_batch_id = ?",
        (import_batch_id,),
    ).fetchone()
    if row is None:
        return PublishDecision(import_batch_id, False, ("BATCH_NOT_FOUND",))
    status, input_classification, profile_status, branch_status, approval, reconciled = row
    reasons: list[str] = []
    if status != "RECONCILED":
        reasons.append("BATCH_NOT_RECONCILED")
    if not reconciled:
        reasons.append("RECONCILIATION_NOT_PASSED")
    if input_classification != "DAILY_RAW":
        reasons.append("INPUT_NOT_DAILY_RAW")
    if profile_status != "APPROVED":
        reasons.append("PROFILE_NOT_APPROVED")
    if branch_status != "APPROVED":
        reasons.append("BRANCH_MAPPING_NOT_APPROVED")
    if not approval:
        reasons.append("APPROVAL_REFERENCE_MISSING")
    return PublishDecision(import_batch_id, not reasons, tuple(reasons))


def publish_batch(connection: sqlite3.Connection, import_batch_id: str) -> None:
    decision = evaluate_publish_eligibility(connection, import_batch_id)
    if not decision.eligible:
        raise ValueError(
            f"batch {import_batch_id} is not publish eligible: {', '.join(decision.reasons)}"
        )
    with connection:
        updated = connection.execute(
            "UPDATE import_batch SET status = 'PUBLISHED' "
            "WHERE import_batch_id = ? AND status = 'RECONCILED'",
            (import_batch_id,),
        ).rowcount
        if updated != 1:
            raise ValueError(f"batch {import_batch_id} publish transition failed")
