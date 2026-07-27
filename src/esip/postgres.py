from __future__ import annotations

import csv
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

import psycopg

from esip.master_data import load_branch_master, load_item_master
from esip.profiles import load_yaml


@dataclass(frozen=True)
class PostgresStatus:
    database: str
    server_version: str
    table_count: int
    view_count: int


@dataclass(frozen=True)
class MasterSyncResult:
    sources: int
    products: int
    excluded_products: int
    branches: int
    approved_branch_mappings: int
    skipped_unchanged: bool = False


def _read_local_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def database_url(root: Path) -> str:
    value = os.environ.get("ESIP_DATABASE_URL")
    if value:
        return value
    value = _read_local_env(root / ".env").get("ESIP_DATABASE_URL")
    if value:
        return value
    raise RuntimeError(
        "ESIP_DATABASE_URL is not configured. Copy .env.example to .env and set it."
    )


def check_postgres(root: Path) -> PostgresStatus:
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT current_database(), current_setting('server_version'),
                       (SELECT COUNT(*) FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'),
                       (SELECT COUNT(*) FROM information_schema.views
                        WHERE table_schema = 'public')
                """
            )
            database, version, tables, views = cursor.fetchone()
    return PostgresStatus(database, version, tables, views)


def sync_item_master(root: Path) -> tuple[int, int]:
    source_path = (
        root / "MasterData" / "ItemMaster" / "incoming" / "ItemMaster_FGFU_OITM.xlsx"
    )
    records, diagnostics = load_item_master(source_path)
    if diagnostics.blank_key_rows or diagnostics.duplicate_keys:
        raise RuntimeError("Item Master has blank or duplicate ItemCodes")
    in_scope = [
        (
            record.item_code,
            record.item_name,
            record.barcode,
            record.active,
            record.product_family,
            source_path.name,
        )
        for record in records
        if record.product_family != "OUT_OF_SCOPE"
    ]
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO dim_product (
                    sap_item_code, item_name, barcode, active, master_record_status,
                    product_family, source_file_name
                )
                VALUES (%s, %s, %s, %s, 'OITM', %s, %s)
                ON CONFLICT (sap_item_code) DO UPDATE SET
                    item_name = EXCLUDED.item_name,
                    barcode = EXCLUDED.barcode,
                    active = EXCLUDED.active,
                    master_record_status = EXCLUDED.master_record_status,
                    product_family = EXCLUDED.product_family,
                    source_file_name = EXCLUDED.source_file_name
                """,
                in_scope,
            )
    return len(in_scope), len(records) - len(in_scope)


def _approved_branch_rows(root: Path) -> list[tuple[str, str, str, str, str, str, None]]:
    path = root / "config" / "branch_crosswalk.csv"
    if not path.is_file():
        return []
    approved: list[tuple[str, str, str, str, str, str, None]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for row_no, row in enumerate(csv.DictReader(stream), start=2):
            status = (row.get("mapping_status") or "").strip().upper()
            if status != "APPROVED":
                continue
            approval_reference = (row.get("approval_reference") or "").strip()
            if not approval_reference:
                raise RuntimeError(
                    f"Approved branch crosswalk row {row_no} has no approval_reference"
                )
            approved.append(
                (
                    (row.get("source_code") or "").strip().upper(),
                    (row.get("branch_source_code") or "").strip(),
                    (row.get("branch_source_name") or "").strip(),
                    (row.get("sap_card_code") or "").strip().upper(),
                    status,
                    approval_reference,
                    None,
                )
            )
    return approved


def _file_hash(path: Path) -> str:
    if not path.is_file():
        return "MISSING"
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def _reference_revision(root: Path) -> dict[str, str]:
    return {
        "source_registry": _file_hash(root / "config" / "source_registry.yaml"),
        "item_master": _file_hash(
            root / "MasterData" / "ItemMaster" / "incoming" / "ItemMaster_FGFU_OITM.xlsx"
        ),
        "branch_master": _file_hash(
            root / "MasterData" / "BranchMaster" / "incoming" / "ModernTrade_Branch.xlsx"
        ),
        "branch_crosswalk": _file_hash(root / "config" / "branch_crosswalk.csv"),
    }


def _reference_state_path(root: Path) -> Path:
    return root / "config" / "reference_sync_state.json"


def _reference_database_evidence(root: Path) -> dict[str, dict[str, object]]:
    queries = {
        "sources": """SELECT COUNT(*),MD5(COALESCE(STRING_AGG(
            source_code||'|'||source_name||'|'||sap_cardcode_prefix||'|'||enabled::text,
            E'\\n' ORDER BY source_code),'')) FROM dim_source""",
        "products": """SELECT COUNT(*),MD5(COALESCE(STRING_AGG(
            sap_item_code||'|'||COALESCE(item_name,'')||'|'||COALESCE(barcode,'')||'|'||
            COALESCE(active,'')||'|'||master_record_status||'|'||
            COALESCE(product_family,'')||'|'||source_file_name,
            E'\\n' ORDER BY sap_item_code),'')) FROM dim_product""",
        "branches": """SELECT COUNT(*),MD5(COALESCE(STRING_AGG(
            sap_card_code||'|'||branch_name||'|'||sap_cardcode_prefix||'|'||source_file_name,
            E'\\n' ORDER BY sap_card_code),'')) FROM dim_branch""",
        "approved_branch_mappings": """SELECT COUNT(*),MD5(COALESCE(STRING_AGG(
            source_code||'|'||branch_source_code||'|'||branch_source_name||'|'||
            sap_card_code||'|'||mapping_status||'|'||approval_reference,
            E'\\n' ORDER BY source_code,branch_source_code,branch_source_name),'')) 
            FROM bridge_source_branch""",
    }
    evidence: dict[str, dict[str, object]] = {}
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            for key, query in queries.items():
                cursor.execute(query)
                count, fingerprint = cursor.fetchone()
                evidence[key] = {"count": count, "fingerprint": fingerprint}
    return evidence


def _unchanged_reference_result(
    root: Path, revision: dict[str, str]
) -> MasterSyncResult | None:
    path = _reference_state_path(root)
    if not path.is_file():
        return None
    state = json.loads(path.read_text(encoding="utf-8"))
    if state.get("revision") != revision:
        return None
    expected = state.get("database_evidence", {})
    actual = _reference_database_evidence(root)
    if actual != expected:
        return None
    return MasterSyncResult(
        sources=int(actual["sources"]["count"]),
        products=int(actual["products"]["count"]),
        excluded_products=state.get("excluded_products", 0),
        branches=int(actual["branches"]["count"]),
        approved_branch_mappings=int(actual["approved_branch_mappings"]["count"]),
        skipped_unchanged=True,
    )


def sync_reference_dimensions(root: Path) -> MasterSyncResult:
    revision = _reference_revision(root)
    unchanged = _unchanged_reference_result(root, revision)
    if unchanged:
        return unchanged
    products, excluded = sync_item_master(root)
    registry = load_yaml(root / "config" / "source_registry.yaml")["sources"]
    source_rows = [
        (
            source_code,
            details["name"],
            details["sap_cardcode_prefix"],
            details.get("enabled", True),
        )
        for source_code, details in sorted(registry.items())
    ]
    branch_path = (
        root / "MasterData" / "BranchMaster" / "incoming" / "ModernTrade_Branch.xlsx"
    )
    branches, diagnostics = load_branch_master(branch_path)
    if diagnostics.blank_key_rows or diagnostics.duplicate_keys:
        raise RuntimeError("Branch Master has blank or duplicate CardCodes")
    branch_rows = [
        (record.card_code, record.card_name, record.card_code[:3], branch_path.name)
        for record in branches
    ]
    approved = _approved_branch_rows(root)
    source_codes = {row[0] for row in source_rows}
    branch_codes = {row[0] for row in branch_rows}
    for source_code, _, _, card_code, _, _, _ in approved:
        if source_code not in source_codes:
            raise RuntimeError(f"Approved branch source {source_code} is not registered")
        if card_code not in branch_codes:
            raise RuntimeError(f"Approved SAP branch {card_code} is not in Branch Master")

    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(
                """INSERT INTO dim_source (source_code, source_name, sap_cardcode_prefix, enabled)
                VALUES (%s,%s,%s,%s)
                ON CONFLICT (source_code) DO UPDATE SET
                    source_name=EXCLUDED.source_name,
                    sap_cardcode_prefix=EXCLUDED.sap_cardcode_prefix,
                    enabled=EXCLUDED.enabled""",
                source_rows,
            )
            cursor.executemany(
                """INSERT INTO dim_branch (
                    sap_card_code, branch_name, sap_cardcode_prefix, source_file_name
                ) VALUES (%s,%s,%s,%s)
                ON CONFLICT (sap_card_code) DO UPDATE SET
                    branch_name=EXCLUDED.branch_name,
                    sap_cardcode_prefix=EXCLUDED.sap_cardcode_prefix,
                    source_file_name=EXCLUDED.source_file_name""",
                branch_rows,
            )
            cursor.execute("DELETE FROM bridge_source_branch")
            cursor.executemany(
                """INSERT INTO bridge_source_branch (
                    source_code, branch_source_code, branch_source_name, sap_card_code,
                    mapping_status, approval_reference, confidence_score
                ) VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                approved,
            )
    result = MasterSyncResult(
        sources=len(source_rows),
        products=products,
        excluded_products=excluded,
        branches=len(branch_rows),
        approved_branch_mappings=len(approved),
    )
    database_evidence = _reference_database_evidence(root)
    state_path = _reference_state_path(root)
    state_path.write_text(
        json.dumps(
            {
                "revision": revision,
                "excluded_products": result.excluded_products,
                "database_evidence": database_evidence,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return result
