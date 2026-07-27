from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass
from pathlib import Path

from esip.manifest import verify_manifest
from esip.profiles import validate_profiles


@dataclass(frozen=True)
class AcceptanceCheck:
    check_code: str
    invariant: str
    status: str
    evidence: str


def _check(code: str, invariant: str, passed: bool, evidence: str) -> AcceptanceCheck:
    return AcceptanceCheck(code, invariant, "PASS" if passed else "FAIL", evidence)


def evaluate_technical_acceptance(
    workspace: Path, connection: sqlite3.Connection
) -> list[AcceptanceCheck]:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
    manifest = verify_manifest(
        workspace, workspace / "SourceFiles" / "source_manifest.csv"
    )
    profile_issues = validate_profiles(
        workspace / "ImportProfiles", workspace / "config" / "source_registry.yaml"
    )
    reconciliation = connection.execute(
        "SELECT COUNT(*), COALESCE(SUM(passed), 0) FROM batch_reconciliation"
    ).fetchone()
    lineage_gaps = connection.execute(
        "SELECT COUNT(*) FROM ("
        "SELECT source_file_name, source_sheet_name, source_row_no FROM fact_sales "
        "UNION ALL SELECT source_file_name, source_sheet_name, source_row_no "
        "FROM fact_inventory_snapshot UNION ALL "
        "SELECT source_file_name, source_sheet_name, source_row_no FROM quarantine_record) "
        "WHERE source_file_name IS NULL OR source_sheet_name IS NULL OR source_row_no IS NULL"
    ).fetchone()[0]
    duplicate_batches = connection.execute(
        "SELECT COUNT(*) FROM (SELECT source_code, source_file_sha256, COUNT(*) count "
        "FROM import_batch GROUP BY source_code, source_file_sha256 HAVING count > 1)"
    ).fetchone()[0]
    staged_recon = connection.execute(
        "SELECT "
        "(SELECT COALESCE(SUM(staged_rows), 0) FROM batch_reconciliation "
        "WHERE dataset = 'sales'), (SELECT COUNT(*) FROM fact_sales), "
        "(SELECT COALESCE(SUM(staged_rows), 0) FROM batch_reconciliation "
        "WHERE dataset = 'inventory'), (SELECT COUNT(*) FROM fact_inventory_snapshot)"
    ).fetchone()
    quarantine_recon = connection.execute(
        "SELECT "
        "(SELECT COALESCE(SUM(quarantined_rows), 0) FROM batch_reconciliation), "
        "(SELECT COUNT(*) FROM quarantine_record)"
    ).fetchone()
    unresolved_products = connection.execute(
        "SELECT COUNT(*) FROM ("
        "SELECT sap_item_code FROM fact_sales UNION ALL "
        "SELECT sap_item_code FROM fact_inventory_snapshot) f "
        "LEFT JOIN dim_product p ON p.sap_item_code = f.sap_item_code "
        "WHERE f.sap_item_code IS NOT NULL AND p.sap_item_code IS NULL"
    ).fetchone()[0]
    invalid_bridge_rows = connection.execute(
        "SELECT COUNT(*) FROM bridge_source_branch "
        "WHERE mapping_status != 'APPROVED' OR TRIM(approval_reference) = ''"
    ).fetchone()[0]
    published_batches = connection.execute(
        "SELECT COUNT(*) FROM import_batch WHERE status = 'PUBLISHED'"
    ).fetchone()[0]
    published_fact_counts = connection.execute(
        "SELECT "
        "(SELECT COUNT(*) FROM vw_published_sales), "
        "(SELECT COUNT(*) FROM fact_sales f JOIN import_batch b "
        "ON b.import_batch_id = f.import_batch_id WHERE b.status = 'PUBLISHED'), "
        "(SELECT COUNT(*) FROM vw_published_inventory), "
        "(SELECT COUNT(*) FROM fact_inventory_snapshot f JOIN import_batch b "
        "ON b.import_batch_id = f.import_batch_id WHERE b.status = 'PUBLISHED')"
    ).fetchone()
    provisional_leaks = connection.execute(
        "SELECT COUNT(*) FROM vw_published_sales s JOIN import_batch b "
        "ON b.import_batch_id = s.import_batch_id "
        "JOIN batch_governance g ON g.import_batch_id = b.import_batch_id "
        "WHERE g.input_classification != 'DAILY_RAW'"
    ).fetchone()[0]
    semantic_catalog = connection.execute(
        "SELECT COUNT(*), SUM(CASE WHEN certification_status = 'PENDING_SOURCE_VALIDATION' "
        "THEN 1 ELSE 0 END) FROM semantic_measure_catalog"
    ).fetchone()

    return [
        _check("TA-01", "SQLite integrity is valid", integrity == "ok", f"integrity={integrity}"),
        _check(
            "TA-02",
            "All foreign keys resolve",
            not foreign_keys,
            f"foreign_key_violations={len(foreign_keys)}",
        ),
        _check(
            "TA-03",
            "All manifested files retain size and SHA-256 identity",
            bool(manifest) and all(item.is_valid for item in manifest),
            f"valid_manifest_entries={sum(item.is_valid for item in manifest)}/{len(manifest)}",
        ),
        _check(
            "TA-04",
            "All registered import profiles are structurally valid",
            not profile_issues,
            f"profile_issues={len(profile_issues)}",
        ),
        _check(
            "TA-05",
            "Every reconciliation gate passes",
            reconciliation[0] > 0 and reconciliation[0] == reconciliation[1],
            f"passed={reconciliation[1]}/{reconciliation[0]}",
        ),
        _check(
            "TA-06",
            "Facts and quarantine retain file/sheet/row lineage",
            lineage_gaps == 0,
            f"lineage_gaps={lineage_gaps}",
        ),
        _check(
            "TA-07",
            "Duplicate file submissions are rejected per logical source",
            duplicate_batches == 0,
            f"duplicate_source_hashes={duplicate_batches}",
        ),
        _check(
            "TA-08",
            "Reconciled staged row counts equal persisted fact counts",
            staged_recon[0] == staged_recon[1] and staged_recon[2] == staged_recon[3],
            (
                f"sales={staged_recon[0]}/{staged_recon[1]}, "
                f"inventory={staged_recon[2]}/{staged_recon[3]}"
            ),
        ),
        _check(
            "TA-09",
            "Reconciled quarantine counts equal persisted quarantine rows",
            quarantine_recon[0] == quarantine_recon[1],
            f"quarantine={quarantine_recon[0]}/{quarantine_recon[1]}",
        ),
        _check(
            "TA-10",
            "Every mapped fact ItemCode resolves to a SAP-governed product dimension key",
            unresolved_products == 0,
            f"unresolved_product_dimensions={unresolved_products}",
        ),
        _check(
            "TA-11",
            "Branch bridge contains approved mappings only",
            invalid_bridge_rows == 0,
            f"invalid_branch_bridge_rows={invalid_bridge_rows}",
        ),
        _check(
            "TA-12",
            "Published views exactly match facts from PUBLISHED batches",
            published_fact_counts[0] == published_fact_counts[1]
            and published_fact_counts[2] == published_fact_counts[3],
            (
                f"sales={published_fact_counts[0]}/{published_fact_counts[1]}, "
                f"inventory={published_fact_counts[2]}/{published_fact_counts[3]}"
            ),
        ),
        _check(
            "TA-13",
            "Provisional inputs never leak into published sales views",
            provisional_leaks == 0,
            f"provisional_published_rows={provisional_leaks}, published_batches={published_batches}",
        ),
        _check(
            "TA-14",
            "Semantic measures declare certification status",
            semantic_catalog[0] == 7 and semantic_catalog[1] == 1,
            (
                f"catalog_measures={semantic_catalog[0]}, "
                f"pending_source_validation={semantic_catalog[1]}"
            ),
        ),
    ]


def write_acceptance_report(checks: list[AcceptanceCheck], path: Path) -> None:
    payload = {
        "overall_status": "PASS" if all(check.status == "PASS" for check in checks) else "FAIL",
        "checks": [asdict(check) for check in checks],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
