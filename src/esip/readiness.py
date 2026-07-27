from __future__ import annotations

import csv
import json
import sqlite3
from dataclasses import asdict, dataclass
from pathlib import Path

from esip.manifest import load_manifest
from esip.profiles import load_yaml


@dataclass(frozen=True)
class ReadinessGate:
    milestone: str
    gate_code: str
    requirement: str
    status: str
    evidence: str
    remediation: str


def evaluate_readiness(workspace: Path, connection: sqlite3.Connection) -> list[ReadinessGate]:
    manifest_count = len(load_manifest(workspace / "SourceFiles" / "source_manifest.csv"))
    profile_statuses = [
        load_yaml(path).get("status", "")
        for path in sorted((workspace / "ImportProfiles").glob("*.yaml"))
    ]
    reconciliations = connection.execute(
        "SELECT COUNT(*), COALESCE(SUM(passed), 0) FROM batch_reconciliation"
    ).fetchone()
    staged_sources = connection.execute(
        "SELECT b.source_code, COUNT(s.sales_id) FROM import_batch b "
        "LEFT JOIN fact_sales s ON s.import_batch_id = b.import_batch_id "
        "GROUP BY b.source_code ORDER BY b.source_code"
    ).fetchall()
    staged_count = sum(count > 0 for _, count in staged_sources)
    missing_staged = [source for source, count in staged_sources if count == 0]
    lineage_missing = connection.execute(
        "SELECT COUNT(*) FROM ("
        "SELECT source_file_name, source_sheet_name, source_row_no FROM fact_sales "
        "UNION ALL SELECT source_file_name, source_sheet_name, source_row_no "
        "FROM fact_inventory_snapshot) "
        "WHERE source_file_name IS NULL OR source_sheet_name IS NULL OR source_row_no IS NULL"
    ).fetchone()[0]
    product_rates = connection.execute(
        "SELECT MIN(item_master_completeness_rate), MAX(item_master_completeness_rate) "
        "FROM vw_product_master_completeness"
    ).fetchone()
    branch_coverage = connection.execute(
        "SELECT COALESCE(SUM(approved_mappings), 0), COALESCE(SUM(source_branch_identities), 0) "
        "FROM vw_branch_crosswalk_coverage"
    ).fetchone()
    approved_profiles = sum(status == "approved" for status in profile_statuses)
    all_reconciled = reconciliations[0] > 0 and reconciliations[0] == reconciliations[1]

    return [
        ReadinessGate(
            "M1",
            "M1-01",
            "All 12 sample files are placed and recorded in the manifest",
            "PASS" if manifest_count >= 12 else "WAITING_EXTERNAL",
            f"Manifest contains {manifest_count}/12 required sample entries",
            "Provide and register the remaining sample files",
        ),
        ReadinessGate(
            "M1",
            "M1-02",
            "Workbook/ZIP/CSV structures are profiled",
            "PARTIAL" if manifest_count < 12 else "PASS",
            "Placed KPI/SAP workbooks are profiled; missing daily samples cannot be profiled",
            "Profile each missing raw daily file when received",
        ),
        ReadinessGate(
            "M1",
            "M1-03",
            "Import profiles for all six sources are completed from real daily files",
            "WAITING_EXTERNAL" if approved_profiles < 6 else "PASS",
            f"{approved_profiles}/6 profiles are approved; current profiles are KPI-derived drafts",
            "Replace drafts with versioned profiles derived from raw daily files",
        ),
        ReadinessGate(
            "M1",
            "M1-04",
            "SAP ItemCode, OSCN, and CardCode mappings are validated",
            "WAITING_EXTERNAL"
            if (product_rates[0] or 0) < 1 or branch_coverage[0] < branch_coverage[1]
            else "PASS",
            (
                f"Item Master completeness range {float(product_rates[0] or 0):.1%}-"
                f"{float(product_rates[1] or 0):.1%}; approved branches "
                f"{branch_coverage[0]}/{branch_coverage[1]}"
            ),
            "Provide complete OITM and approve the governed branch crosswalk",
        ),
        ReadinessGate(
            "M1",
            "M1-05",
            "At least one sample per source reaches canonical staging with full lineage",
            "PASS" if staged_count == 6 and lineage_missing == 0 else "WAITING_EXTERNAL",
            (
                f"{staged_count}/6 sources have sales facts; missing: "
                f"{','.join(missing_staged) or 'none'}; lineage gaps: {lineage_missing}"
            ),
            "Resolve missing OSCN mappings for sources with zero staged facts",
        ),
        ReadinessGate(
            "M1",
            "M1-06",
            "All staged datasets reconcile before batch publication",
            "PASS" if all_reconciled else "NOT_MET",
            f"{reconciliations[1]}/{reconciliations[0]} reconciliation gates pass",
            "Resolve failed reconciliation differences",
        ),
        ReadinessGate(
            "M2",
            "M2-01",
            "Routine daily imports run without source-specific code changes",
            "WAITING_EXTERNAL",
            "Engine is configuration-driven, but no raw daily file set is available for proof",
            "Run acceptance suite against representative daily files for all six sources",
        ),
    ]


def write_readiness(gates: list[ReadinessGate], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with (output_dir / "milestone_readiness.json").open("w", encoding="utf-8") as stream:
        json.dump([asdict(gate) for gate in gates], stream, ensure_ascii=False, indent=2)
    with (output_dir / "milestone_readiness.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=list(ReadinessGate.__dataclass_fields__))
        writer.writeheader()
        writer.writerows(asdict(gate) for gate in gates)


def write_product_remediation_queue(connection: sqlite3.Connection, path: Path) -> int:
    usage_rows = connection.execute(
        "WITH usage AS ("
        "SELECT sap_item_code, source_code, COUNT(*) sales_rows, 0 inventory_rows "
        "FROM fact_sales GROUP BY sap_item_code, source_code "
        "UNION ALL "
        "SELECT sap_item_code, source_code, 0, COUNT(*) "
        "FROM fact_inventory_snapshot GROUP BY sap_item_code, source_code) "
        "SELECT p.sap_item_code, u.source_code, COALESCE(SUM(u.sales_rows), 0), "
        "COALESCE(SUM(u.inventory_rows), 0) "
        "FROM dim_product p LEFT JOIN usage u ON u.sap_item_code = p.sap_item_code "
        "WHERE p.master_record_status = 'OSCN_ONLY' "
        "GROUP BY p.sap_item_code, u.source_code ORDER BY p.sap_item_code, u.source_code"
    ).fetchall()
    grouped: dict[str, dict[str, object]] = {}
    for item_code, source_code, sales_rows, inventory_rows in usage_rows:
        item = grouped.setdefault(
            item_code, {"sales": 0, "inventory": 0, "sources": set()}
        )
        item["sales"] = int(item["sales"]) + sales_rows
        item["inventory"] = int(item["inventory"]) + inventory_rows
        if source_code:
            sources = item["sources"]
            assert isinstance(sources, set)
            sources.add(source_code)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "sap_item_code",
                "sales_fact_rows",
                "inventory_fact_rows",
                "source_codes",
                "priority",
                "required_action",
            ]
        )
        ordered = sorted(
            grouped.items(),
            key=lambda item: (-(int(item[1]["sales"]) + int(item[1]["inventory"])), item[0]),
        )
        for item_code, usage in ordered:
            sources = usage["sources"]
            assert isinstance(sources, set)
            affected_rows = int(usage["sales"]) + int(usage["inventory"])
            writer.writerow(
                [
                    item_code,
                    usage["sales"],
                    usage["inventory"],
                    "|".join(sorted(sources)),
                    "HIGH" if affected_rows else "LOW",
                    (
                        "REQUEST_COMPLETE_OITM_RECORD"
                        if affected_rows
                        else "COMPLETE_OSCN_CATALOG_HYGIENE"
                    ),
                ]
            )
    return len(grouped)


def write_branch_remediation_queue(
    connection: sqlite3.Connection, candidate_path: Path, output_path: Path
) -> int:
    candidates: dict[tuple[str, str, str], dict[str, str]] = {}
    if candidate_path.is_file():
        with candidate_path.open("r", encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                if row["rank"] == "1":
                    candidates[
                        (row["source_code"], row["branch_source_code"], row["branch_source_name"])
                    ] = row
    identities = connection.execute(
        "WITH rows AS ("
        "SELECT source_code, branch_source_code, COALESCE(branch_source_name, '') name, "
        "COUNT(*) fact_rows FROM fact_sales GROUP BY source_code, branch_source_code, name "
        "UNION ALL SELECT source_code, branch_source_code, COALESCE(branch_source_name, ''), "
        "COUNT(*) FROM fact_inventory_snapshot "
        "GROUP BY source_code, branch_source_code, COALESCE(branch_source_name, '')) "
        "SELECT source_code, branch_source_code, name, SUM(fact_rows) FROM rows "
        "GROUP BY source_code, branch_source_code, name ORDER BY source_code, branch_source_code, name"
    ).fetchall()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "source_code",
                "branch_source_code",
                "branch_source_name",
                "fact_rows",
                "candidate_card_code",
                "candidate_card_name",
                "candidate_score",
                "required_action",
                "approval_reference",
            ]
        )
        for source_code, branch_code, branch_name, fact_rows in identities:
            candidate = candidates.get((source_code, branch_code, branch_name), {})
            writer.writerow(
                [
                    source_code,
                    branch_code,
                    branch_name,
                    fact_rows,
                    candidate.get("candidate_card_code", ""),
                    candidate.get("candidate_card_name", ""),
                    candidate.get("score", ""),
                    "REVIEW_AND_APPROVE_BRANCH_MAPPING",
                    "",
                ]
            )
    return len(identities)
