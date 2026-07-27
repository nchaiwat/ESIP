from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import shutil
from pathlib import Path

from esip.approvals import apply_approval_result, evaluate_approval_workbook
from esip.daily_ingest import ingest_hp_mh, ingest_twd
from esip.wide_ingest import ingest_dh_inventory, ingest_dh_sales, ingest_gbh, ingest_hh
from esip.manifest import verify_manifest
from esip.master_data import (
    load_branch_master,
    load_item_master,
    load_oscn,
    write_oscn_ambiguity_report,
)
from esip.profiles import validate_profiles
from esip.postgres import check_postgres, sync_reference_dimensions
from esip.publication_governance import (
    apply_publication_approvals,
    evaluate_publication_approvals,
)


def workspace_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / "config" / "source_registry.yaml").is_file():
            return candidate
    raise SystemExit("ESIP workspace not found from the current directory")


def process_approvals(root: Path, workbook: str | None, *, apply: bool) -> int:
    workbook_path = Path(workbook) if workbook else (
        root / "output" / "reports" / "ESIP_Daily_Raw_Preview.xlsx"
    )
    if not workbook_path.is_absolute():
        workbook_path = root / workbook_path
    result = evaluate_approval_workbook(root, workbook_path)
    print(f"Workbook: {workbook_path}")
    print(
        f"Approved: {len(result.approved_branches)} branch, "
        f"{len(result.approved_products)} product"
    )
    print(
        f"Rejected (recorded in workbook only): {result.rejected_branches} branch, "
        f"{result.rejected_products} product"
    )
    if result.issues:
        for issue in result.issues:
            location = f" row {issue.row}" if issue.row else ""
            print(f"FAIL {issue.sheet}{location}: {issue.message}")
        print("No files changed.")
        return 1
    if not apply:
        print("CHECK PASSED - no files changed.")
        return 0
    if not result.approved_branches and not result.approved_products:
        print("NOTHING TO APPLY - no files changed.")
        return 0
    branch_count, product_count = apply_approval_result(root, result, workbook_path)
    digest = hashlib.sha256(workbook_path.read_bytes()).hexdigest()
    archive_dir = root / "output" / "approvals"
    archive_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archived = archive_dir / f"applied_{timestamp}_{digest[:12]}.xlsx"
    shutil.copy2(workbook_path, archived)
    print(f"APPLIED: {branch_count} branch mapping(s)")
    print(f"CREATED/UPDATED: {product_count} OSCN change request(s)")
    print("PRE-CHANGE BACKUP: output\\governance_backups")
    print(f"AUDIT COPY: {archived.relative_to(root)}")
    return 0


def process_publication_approvals(
    root: Path, workbook: str | None, *, apply: bool
) -> int:
    workbook_path = Path(workbook) if workbook else (
        root / "output" / "reports" / "ESIP_Daily_Raw_Preview.xlsx"
    )
    if not workbook_path.is_absolute():
        workbook_path = root / workbook_path
    result = evaluate_publication_approvals(root, workbook_path)
    print(f"Workbook: {workbook_path}")
    print(f"Approved governance rows: {len(result.approved)}")
    print(f"Rejected (workbook only): {result.rejected}")
    if result.issues:
        for issue in result.issues:
            location = f" row {issue.row}" if issue.row else ""
            print(f"FAIL Publication Readiness{location}: {issue.message}")
        print("No files or database rows changed.")
        return 1
    if not apply:
        print("CHECK PASSED - no files or database rows changed.")
        return 0
    if not result.approved:
        print("NOTHING TO APPLY - no files or database rows changed.")
        return 0
    count = apply_publication_approvals(root, workbook_path, result)
    digest = hashlib.sha256(workbook_path.read_bytes()).hexdigest()
    archive_dir = root / "output" / "publication_approvals"
    archive_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archived = archive_dir / f"approved_{timestamp}_{digest[:12]}.xlsx"
    shutil.copy2(workbook_path, archived)
    print(f"APPLIED GOVERNANCE APPROVAL: {count} batch(es)")
    print("PUBLISHED: 0 batch(es) - publishing is a separate controlled action")
    print("PRE-CHANGE BACKUP: output\\governance_backups")
    print(f"AUDIT COPY: {archived.relative_to(root)}")
    return 0


def show_status(root: Path) -> int:
    manifest = root / "SourceFiles" / "source_manifest.csv"
    manifest_checks = verify_manifest(root, manifest)
    profile_issues = validate_profiles(
        root / "ImportProfiles", root / "config" / "source_registry.yaml"
    )
    profile_count = len(list((root / "ImportProfiles").glob("*.yaml")))
    valid_files = sum(check.is_valid for check in manifest_checks)
    daily_raw_files = sum(
        check.is_valid
        and check.entry.relative_path.replace("\\", "/").startswith("SourceFiles/")
        for check in manifest_checks
    )
    master_files = sum(
        check.is_valid
        and check.entry.relative_path.replace("\\", "/").startswith("MasterData/")
        for check in manifest_checks
    )
    print("ESIP Sprint M1 - Source onboarding baseline")
    print(f"Manifest: {valid_files}/{len(manifest_checks)} files verified")
    print(f"Daily Raw: {daily_raw_files} files verified")
    print(f"SAP Master Data: {master_files} files verified")
    print(
        "Daily Raw import profiles: "
        f"{profile_count - len({i.profile for i in profile_issues})}/"
        f"{profile_count} structurally valid"
    )
    print("Active workflow: Daily Raw to PostgreSQL")
    return 0 if valid_files == len(manifest_checks) and not profile_issues else 1


def show_postgres_status(root: Path) -> int:
    try:
        status = check_postgres(root)
    except Exception as error:
        print(f"PostgreSQL: NOT READY ({error})")
        return 1
    print("PostgreSQL: READY")
    print(f"Database: {status.database}")
    print(f"Server: {status.server_version}")
    print(f"Schema: {status.table_count} tables, {status.view_count} views")
    return 0


def load_postgres_master(root: Path) -> int:
    result = sync_reference_dimensions(root)
    if result.skipped_unchanged:
        print("Reference masters unchanged: PostgreSQL sync skipped")
    print(f"Source registry loaded to PostgreSQL: {result.sources} sources")
    print(f"Item Master loaded to PostgreSQL: {result.products} FA/FU products")
    print(f"Out-of-scope ItemCodes excluded: {result.excluded_products}")
    print(f"Branch Master loaded to PostgreSQL: {result.branches} branches")
    print(f"Approved branch mappings loaded: {result.approved_branch_mappings}")
    return 0


def load_hp_mh_daily(root: Path) -> int:
    summaries = ingest_hp_mh(root)
    for item in summaries:
        status = "SKIP" if item.skipped_existing else "OK"
        print(
            f"{status} {item.source_code} {item.dataset}: "
            f"{item.staged_rows} loaded, {item.quarantined_rows} quarantined, "
            f"{item.source_rows} source rows"
        )
    return 0


def load_twd_daily(root: Path) -> int:
    for item in ingest_twd(root):
        status = "SKIP" if item.skipped_existing else "OK"
        print(
            f"{status} TWD {item.dataset}: {item.staged_rows} loaded, "
            f"{item.quarantined_rows} quarantined, {item.source_rows} source rows"
        )
    return 0


def load_hh_daily(root: Path) -> int:
    for item in ingest_hh(root):
        status = "SKIP" if item.skipped_existing else "OK"
        print(
            f"{status} HH {item.dataset}: {item.staged_rows} loaded, "
            f"{item.quarantined_rows} quarantined, {item.source_rows} source rows"
        )
    return 0


def load_gbh_daily(root: Path) -> int:
    for item in ingest_gbh(root):
        status = "SKIP" if item.skipped_existing else "OK"
        print(
            f"{status} GBH {item.dataset}: {item.staged_rows} loaded, "
            f"{item.quarantined_rows} quarantined, {item.source_rows} source rows"
        )
    return 0


def load_dh_inventory_daily(root: Path) -> int:
    for item in ingest_dh_inventory(root):
        status = "SKIP" if item.skipped_existing else "OK"
        print(
            f"{status} DH inventory: {item.staged_rows} loaded, "
            f"{item.quarantined_rows} quarantined, {item.source_rows} source rows"
        )
    return 0


def load_dh_daily(root: Path) -> int:
    for item in [*ingest_dh_sales(root), *ingest_dh_inventory(root)]:
        status = "SKIP" if item.skipped_existing else "OK"
        print(
            f"{status} DH {item.dataset}: {item.staged_rows} loaded, "
            f"{item.quarantined_rows} quarantined, {item.source_rows} source rows"
        )
    return 0


def show_manifest(root: Path) -> int:
    checks = verify_manifest(root, root / "SourceFiles" / "source_manifest.csv")
    for check in checks:
        result = "OK" if check.is_valid else "FAIL"
        print(f"{result} {check.entry.relative_path}")
    failures = sum(not check.is_valid for check in checks)
    print(f"Verified {len(checks) - failures}/{len(checks)} manifest entries")
    return 1 if failures else 0


def show_profiles(root: Path) -> int:
    issues = validate_profiles(
        root / "ImportProfiles", root / "config" / "source_registry.yaml"
    )
    if not issues:
        profile_count = len(list((root / "ImportProfiles").glob("*.yaml")))
        print(f"All {profile_count} registered import profiles passed structural validation")
        return 0
    for issue in issues:
        print(f"FAIL {issue.profile}: {issue.message}")
    return 1


def show_master_data(root: Path) -> int:
    loaders = (
        (
            "Item Master",
            load_item_master,
            root / "MasterData" / "ItemMaster" / "incoming" / "ItemMaster_FGFU_OITM.xlsx",
        ),
        (
            "OSCN",
            load_oscn,
            root
            / "MasterData"
            / "OSCN"
            / "incoming"
            / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx",
        ),
        (
            "Branch Master",
            load_branch_master,
            root / "MasterData" / "BranchMaster" / "incoming" / "ModernTrade_Branch.xlsx",
        ),
    )
    failed = False
    for label, loader, path in loaders:
        records, diagnostics = loader(path)
        status = "OK"
        if diagnostics.blank_key_rows or diagnostics.ambiguous_keys:
            status = "REVIEW"
            failed = True
        print(
            f"{status} {label}: {len(records)} valid rows, "
            f"{len(diagnostics.blank_key_rows)} blank-key rows, "
            f"{len(diagnostics.duplicate_keys)} duplicate keys, "
            f"{len(diagnostics.ambiguous_keys)} ambiguous keys"
        )
        if label == "OSCN" and diagnostics.ambiguous_keys:
            report_path = root / "output" / "reports" / "oscn_ambiguities.csv"
            write_oscn_ambiguity_report(records, report_path)
            print(f"Report: {report_path.relative_to(root)}")
    return 1 if failed else 0


def main() -> None:
    parser = argparse.ArgumentParser(prog="esip")
    parser.add_argument(
        "command",
        choices=[
            "status",
            "postgres-status",
            "postgres-load-master",
            "postgres-load-hp-mh",
            "postgres-load-twd",
            "postgres-load-hh",
            "postgres-load-gbh",
            "postgres-load-dh",
            "postgres-load-dh-inventory",
            "verify-manifest",
            "validate-profiles",
            "validate-master-data",
            "approval-check",
            "apply-approvals",
            "publication-check",
            "apply-publication-approvals",
        ],
    )
    parser.add_argument("--workbook", help="Reviewed approval workbook path")
    args = parser.parse_args()
    root = workspace_root()
    if args.command == "status":
        code = show_status(root)
    elif args.command == "postgres-status":
        code = show_postgres_status(root)
    elif args.command == "postgres-load-master":
        code = load_postgres_master(root)
    elif args.command == "postgres-load-hp-mh":
        code = load_hp_mh_daily(root)
    elif args.command == "postgres-load-twd":
        code = load_twd_daily(root)
    elif args.command == "postgres-load-hh":
        code = load_hh_daily(root)
    elif args.command == "postgres-load-gbh":
        code = load_gbh_daily(root)
    elif args.command == "postgres-load-dh":
        code = load_dh_daily(root)
    elif args.command == "postgres-load-dh-inventory":
        code = load_dh_inventory_daily(root)
    elif args.command == "verify-manifest":
        code = show_manifest(root)
    elif args.command == "validate-master-data":
        code = show_master_data(root)
    elif args.command == "approval-check":
        code = process_approvals(root, args.workbook, apply=False)
    elif args.command == "apply-approvals":
        code = process_approvals(root, args.workbook, apply=True)
    elif args.command == "publication-check":
        code = process_publication_approvals(root, args.workbook, apply=False)
    elif args.command == "apply-publication-approvals":
        code = process_publication_approvals(root, args.workbook, apply=True)
    else:
        code = show_profiles(root)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
