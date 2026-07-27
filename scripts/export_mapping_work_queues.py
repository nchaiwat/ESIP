from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

import psycopg

from esip.branch_mapping import SourceBranch, rank_branch_candidates
from esip.master_data import (
    OscnRecord,
    load_branch_master,
    load_oscn,
    normalize_identifier,
)
from esip.postgres import database_url
from esip.profiles import load_yaml


def _priority(rank: int, affected_rows: int, cumulative: int, total: int) -> list[object]:
    impact_share = affected_rows / total if total else 0
    cumulative_share = cumulative / total if total else 0
    if cumulative_share <= 0.5 or rank == 1:
        tier = "P1_FIRST_50_PERCENT"
    elif cumulative_share <= 0.8:
        tier = "P2_NEXT_TO_80_PERCENT"
    elif cumulative_share <= 0.95:
        tier = "P3_NEXT_TO_95_PERCENT"
    else:
        tier = "P4_REMAINDER"
    return [rank, impact_share, cumulative_share, tier]


def _product_candidates(
    records: list[OscnRecord],
    source_code: str,
    cardcode_match: str,
) -> dict[str, set[str]]:
    grouped: dict[str, set[str]] = defaultdict(set)
    for record in records:
        matches = (
            record.card_code == cardcode_match
            if source_code == "TA"
            else record.card_code.startswith(cardcode_match)
        )
        if not matches:
            continue
        for raw_key in (record.customer_sku, record.partner_barcode):
            key = normalize_identifier(raw_key)
            if key:
                grouped[key].add(record.item_code)
    return grouped


def _global_oscn_candidates(
    records: list[OscnRecord],
) -> dict[str, dict[str, set[str]]]:
    grouped: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for record in records:
        for raw_key in (record.customer_sku, record.partner_barcode):
            key = normalize_identifier(raw_key)
            if key:
                grouped[key][record.item_code].add(record.card_code)
    return grouped


def _exact_barcode_candidates(
    rows: list[tuple[str, str | None]],
) -> dict[str, set[str]]:
    grouped: dict[str, set[str]] = defaultdict(set)
    for item_code, barcode in rows:
        key = normalize_identifier(barcode)
        if key:
            grouped[key].add(item_code)
    return grouped


def _unique_branch_name_lookup(
    identities: list[tuple[str, str, str, int]],
) -> dict[tuple[str, str], str]:
    grouped: dict[tuple[str, str], set[str]] = defaultdict(set)
    for source_code, branch_code, branch_name, _affected_rows in identities:
        normalized_name = normalize_identifier(branch_name)
        if branch_code and normalized_name:
            grouped[(source_code, branch_code)].add(normalized_name)
    return {
        key: next(iter(names))
        for key, names in grouped.items()
        if len(names) == 1
    }


def export_product_queue(root: Path, cursor: psycopg.Cursor) -> int:
    registry = load_yaml(root / "config" / "source_registry.yaml")["sources"]
    cursor.execute(
        """SELECT q.source_code,
        COALESCE(
            q.source_payload_json->>'product_code',
            q.source_payload_json->>'sku',
            q.source_payload_json->>'ARTNO',
            q.source_payload_json->>'VDARTNO',
            q.source_payload_json->>'ARTEAN'
        ) AS source_product_code,
        SUM(CASE WHEN q.dataset='sales' THEN 1 ELSE 0 END) AS sales_rows,
        SUM(CASE WHEN q.dataset='inventory' THEN 1 ELSE 0 END) AS inventory_rows,
        COUNT(*) AS total_rows
        FROM quarantine_record q
        WHERE q.reason_code='PRODUCT_NOT_MAPPED'
        GROUP BY q.source_code, source_product_code
        HAVING COALESCE(
            q.source_payload_json->>'product_code',
            q.source_payload_json->>'sku',
            q.source_payload_json->>'ARTNO',
            q.source_payload_json->>'VDARTNO',
            q.source_payload_json->>'ARTEAN'
        ) IS NOT NULL
        ORDER BY total_rows DESC, q.source_code, source_product_code"""
    )
    rows = cursor.fetchall()
    oscn_path = (
        root
        / "MasterData"
        / "OSCN"
        / "incoming"
        / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx"
    )
    oscn_records, _ = load_oscn(oscn_path)
    indexes = {
        source_code: _product_candidates(
            oscn_records,
            source_code,
            details["sap_cardcode_prefix"],
        )
        for source_code, details in registry.items()
    }
    global_oscn_index = _global_oscn_candidates(oscn_records)
    cursor.execute(
        """SELECT sap_item_code, barcode
        FROM dim_product
        WHERE barcode IS NOT NULL AND BTRIM(barcode) <> ''"""
    )
    barcode_index = _exact_barcode_candidates(cursor.fetchall())
    output = root / "output" / "operations" / "product_mapping_queue.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    total_affected = sum(row[4] for row in rows)
    cumulative = 0
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "source_code",
                "source_product_code",
                "sales_rows",
                "inventory_rows",
                "total_affected_rows",
                "priority_rank",
                "impact_share",
                "cumulative_impact_share",
                "priority_tier",
                "candidate_item_count",
                "candidate_sap_item_codes",
                "candidate_basis",
                "candidate_evidence_cardcode_prefixes",
                "candidate_evidence_card_count",
                "recommended_action",
                "mapping_status",
                "approval_reference",
            ]
        )
        for rank, (
            source_code,
            product_code,
            sales_rows,
            inventory_rows,
            total_rows,
        ) in enumerate(rows, start=1):
            cumulative += total_rows
            oscn_candidates = indexes.get(source_code, {}).get(product_code, set())
            barcode_candidates = barcode_index.get(normalize_identifier(product_code), set())
            global_candidates = global_oscn_index.get(
                normalize_identifier(product_code), {}
            )
            evidence_card_codes: set[str] = set()
            if oscn_candidates:
                candidates = sorted(oscn_candidates)
                basis = "EXISTING_OSCN"
            elif barcode_candidates:
                candidates = sorted(barcode_candidates)
                basis = "EXACT_ITEM_MASTER_BARCODE"
            elif len(global_candidates) == 1:
                candidates = sorted(global_candidates)
                basis = "UNIQUE_CROSS_SOURCE_OSCN"
                evidence_card_codes = next(iter(global_candidates.values()))
            else:
                candidates = []
                basis = "NO_EXACT_CANDIDATE"
            if basis == "EXACT_ITEM_MASTER_BARCODE" and len(candidates) == 1:
                action = "ADD_OSCN_FROM_EXACT_BARCODE"
            elif basis == "UNIQUE_CROSS_SOURCE_OSCN":
                action = "ADD_OSCN_FROM_CROSS_SOURCE_EXACT"
            elif not candidates:
                action = "ADD_OR_CORRECT_OSCN"
            elif len(candidates) > 1:
                action = "RESOLVE_AMBIGUOUS_OSCN"
            else:
                action = "REVIEW_NORMALIZATION_RULE"
            writer.writerow(
                [
                    source_code,
                    product_code,
                    sales_rows,
                    inventory_rows,
                    total_rows,
                    *_priority(rank, total_rows, cumulative, total_affected),
                    len(candidates),
                    "|".join(candidates),
                    basis,
                    "|".join(
                        sorted({card_code.split("-", 1)[0] for card_code in evidence_card_codes})
                    ),
                    len(evidence_card_codes),
                    action,
                    "PENDING",
                    "",
                ]
            )
    return len(rows)


def export_branch_queue(root: Path, cursor: psycopg.Cursor) -> int:
    cursor.execute(
        """WITH identities AS (
            SELECT source_code, branch_source_code, COALESCE(branch_source_name, '') AS branch_name
            FROM fact_sales
            UNION ALL
            SELECT source_code, branch_source_code, COALESCE(branch_source_name, '')
            FROM fact_inventory_snapshot
            UNION ALL
            SELECT source_code,
            COALESCE(
                source_payload_json->>'branch_code',
                source_payload_json->>'SITENO',
                source_payload_json->>'branch',
                ''
            ),
            COALESCE(
                source_payload_json->>'branch_name',
                source_payload_json->>'SITENAME',
                source_payload_json->>'branch',
                ''
            )
            FROM quarantine_record
        )
        SELECT source_code, branch_source_code, branch_name, COUNT(*) AS affected_rows
        FROM identities
        WHERE branch_source_code <> '' OR branch_name <> ''
        GROUP BY source_code, branch_source_code, branch_name
        ORDER BY affected_rows DESC, source_code, branch_source_code, branch_name"""
    )
    identities = cursor.fetchall()
    branch_name_lookup = _unique_branch_name_lookup(identities)
    branch_path = (
        root / "MasterData" / "BranchMaster" / "incoming" / "ModernTrade_Branch.xlsx"
    )
    masters, _ = load_branch_master(branch_path)
    registry = load_yaml(root / "config" / "source_registry.yaml")["sources"]
    output = root / "output" / "operations" / "branch_mapping_approval_queue.csv"
    total_affected = sum(row[3] for row in identities)
    cumulative = 0
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "source_code",
                "branch_source_code",
                "branch_source_name",
                "matching_name_used",
                "candidate_basis",
                "affected_rows",
                "priority_rank",
                "impact_share",
                "cumulative_impact_share",
                "priority_tier",
                "candidate_card_code",
                "candidate_card_name",
                "similarity_score",
                "recommendation",
                "mapping_status",
                "approval_reference",
            ]
        )
        for rank, (source_code, branch_code, branch_name, affected_rows) in enumerate(
            identities, start=1
        ):
            cumulative += affected_rows
            prefix = registry[source_code]["sap_cardcode_prefix"]
            matching_name = normalize_identifier(branch_name)
            if matching_name:
                candidate_basis = "SOURCE_BRANCH_NAME"
            else:
                matching_name = branch_name_lookup.get((source_code, branch_code), "")
                candidate_basis = (
                    "SAME_CODE_NAME_ENRICHMENT"
                    if matching_name
                    else "NO_BRANCH_NAME"
                )
            candidates = rank_branch_candidates(
                SourceBranch(source_code, branch_code, matching_name),
                masters,
                prefix,
                limit=1,
            )
            candidate = candidates[0] if candidates else None
            writer.writerow(
                [
                    source_code,
                    branch_code,
                    branch_name,
                    matching_name,
                    candidate_basis,
                    affected_rows,
                    *_priority(rank, affected_rows, cumulative, total_affected),
                    candidate.card_code if candidate else "",
                    candidate.card_name if candidate else "",
                    candidate.score if candidate else "",
                    candidate.recommendation if candidate else "NO_CANDIDATE",
                    "PENDING",
                    "",
                ]
            )
    return len(identities)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            products = export_product_queue(root, cursor)
            branches = export_branch_queue(root, cursor)
    print(f"Product mapping queue: {products} source product codes")
    print(f"Branch approval queue: {branches} source branch identities")


if __name__ == "__main__":
    main()
