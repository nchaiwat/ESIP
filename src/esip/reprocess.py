from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg import sql

from esip.daily_ingest import ingest_hp_mh, ingest_twd
from esip.postgres import database_url
from esip.wide_ingest import ingest_dh_inventory, ingest_dh_sales, ingest_gbh, ingest_hh


REPROCESS_TABLES = (
    "import_batch",
    "fact_sales",
    "fact_inventory_snapshot",
    "quarantine_record",
    "batch_reconciliation",
    "batch_governance",
)
DELETE_ORDER = (
    "fact_sales",
    "fact_inventory_snapshot",
    "quarantine_record",
    "batch_reconciliation",
    "batch_governance",
    "import_batch",
)
RESTORE_ORDER = (
    "import_batch",
    "batch_governance",
    "batch_reconciliation",
    "fact_sales",
    "fact_inventory_snapshot",
    "quarantine_record",
)
IDENTITY_TABLES = {
    "fact_sales": ("sales_id",),
    "fact_inventory_snapshot": ("inventory_snapshot_id",),
    "quarantine_record": ("quarantine_id",),
    "batch_reconciliation": ("reconciliation_id",),
}


@dataclass(frozen=True)
class ReprocessSnapshot:
    batch_count: int
    reconciliation_count: int
    source_rows: int
    staged_rows: int
    quarantined_rows: int
    product_not_mapped_rows: int
    all_reconciliations_passed: bool


@dataclass(frozen=True)
class ReprocessResult:
    status: str
    previous_oscn_sha256: str
    current_oscn_sha256: str
    before: ReprocessSnapshot | None
    after: ReprocessSnapshot | None
    message: str


def oscn_path(root: Path) -> Path:
    return (
        root
        / "MasterData"
        / "OSCN"
        / "incoming"
        / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx"
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def snapshot(connection: psycopg.Connection) -> ReprocessSnapshot:
    with connection.cursor() as cursor:
        cursor.execute(
            """SELECT
            (SELECT COUNT(*) FROM import_batch),
            COUNT(*),
            COALESCE(SUM(source_rows),0),
            COALESCE(SUM(staged_rows),0),
            COALESCE(SUM(quarantined_rows),0),
            COALESCE(BOOL_AND(passed),TRUE)
            FROM batch_reconciliation"""
        )
        batches, reconciliations, source_rows, staged, quarantined, passed = cursor.fetchone()
        cursor.execute(
            "SELECT COUNT(*) FROM quarantine_record WHERE reason_code='PRODUCT_NOT_MAPPED'"
        )
        product_not_mapped = cursor.fetchone()[0]
    return ReprocessSnapshot(
        batches,
        reconciliations,
        source_rows,
        staged,
        quarantined,
        product_not_mapped,
        bool(passed),
    )


def _source_reconciliation(connection: psycopg.Connection) -> list[tuple[object, ...]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """SELECT b.source_code, r.dataset, COUNT(*), SUM(r.source_rows),
            SUM(r.source_measure)
            FROM batch_reconciliation r
            JOIN import_batch b USING(import_batch_id)
            GROUP BY b.source_code, r.dataset
            ORDER BY b.source_code, r.dataset"""
        )
        return cursor.fetchall()


def _create_backup(connection: psycopg.Connection, schema: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        for table in REPROCESS_TABLES:
            cursor.execute(
                sql.SQL("CREATE TABLE {}.{} AS TABLE public.{}").format(
                    sql.Identifier(schema),
                    sql.Identifier(table),
                    sql.Identifier(table),
                )
            )


def _clear_current(connection: psycopg.Connection) -> None:
    with connection.cursor() as cursor:
        for table in DELETE_ORDER:
            cursor.execute(sql.SQL("DELETE FROM {}").format(sql.Identifier(table)))


def _restore(connection: psycopg.Connection, schema: str) -> None:
    _clear_current(connection)
    with connection.cursor() as cursor:
        for table in RESTORE_ORDER:
            override = sql.SQL(" OVERRIDING SYSTEM VALUE") if table in IDENTITY_TABLES else sql.SQL("")
            cursor.execute(
                sql.SQL("INSERT INTO {}{} SELECT * FROM {}.{}").format(
                    sql.Identifier(table),
                    override,
                    sql.Identifier(schema),
                    sql.Identifier(table),
                )
            )
        for table, (column,) in IDENTITY_TABLES.items():
            cursor.execute(
                sql.SQL(
                    "SELECT setval(pg_get_serial_sequence(%s,%s), "
                    "COALESCE((SELECT MAX({}) FROM {}),1), "
                    "EXISTS(SELECT 1 FROM {}))"
                ).format(
                    sql.Identifier(column),
                    sql.Identifier(table),
                    sql.Identifier(table),
                ),
                (table, column),
            )


def _drop_backup(connection: psycopg.Connection, schema: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
        )


def _reload_all(root: Path) -> None:
    ingest_hp_mh(root)
    ingest_twd(root)
    ingest_hh(root)
    ingest_gbh(root)
    ingest_dh_sales(root)
    ingest_dh_inventory(root)


def _state_path(root: Path) -> Path:
    return root / "config" / "oscn_reprocess_state.json"


def _write_state(root: Path, result: ReprocessResult) -> None:
    path = _state_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    recorded_at = datetime.now(timezone.utc)
    payload = {
        **asdict(result),
        "recorded_at_utc": recorded_at.isoformat(timespec="seconds"),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    history_dir = root / "output" / "reprocess"
    history_dir.mkdir(parents=True, exist_ok=True)
    history_path = history_dir / (
        f"oscn_reprocess_{recorded_at.strftime('%Y%m%d_%H%M%S')}_{result.status.lower()}.json"
    )
    history_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def reprocess_if_oscn_changed(root: Path, *, force: bool = False) -> ReprocessResult:
    current_hash = file_sha256(oscn_path(root))
    state_path = _state_path(root)
    previous_hash = ""
    if state_path.is_file():
        previous_hash = json.loads(state_path.read_text(encoding="utf-8")).get(
            "current_oscn_sha256", ""
        )
    if not previous_hash and not force:
        result = ReprocessResult(
            "BASELINE_RECORDED",
            "",
            current_hash,
            None,
            None,
            "Current OSCN hash recorded; no historical data was changed.",
        )
        _write_state(root, result)
        return result
    if previous_hash == current_hash and not force:
        return ReprocessResult(
            "NO_CHANGE",
            previous_hash,
            current_hash,
            None,
            None,
            "OSCN has not changed; reprocess was not required.",
        )

    schema = f"esip_reprocess_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM import_batch WHERE status='PUBLISHED'")
            if cursor.fetchone()[0]:
                raise RuntimeError("Published batches exist; automatic historical reprocess is blocked")
        before = snapshot(connection)
        before_source = _source_reconciliation(connection)
        _create_backup(connection, schema)
        _clear_current(connection)
    try:
        _reload_all(root)
        with psycopg.connect(database_url(root)) as connection:
            after = snapshot(connection)
            after_source = _source_reconciliation(connection)
            if before_source != after_source:
                raise RuntimeError("Source reconciliation totals changed after OSCN reprocess")
            if not after.all_reconciliations_passed:
                raise RuntimeError("One or more reconciliations failed after OSCN reprocess")
            if after.product_not_mapped_rows > before.product_not_mapped_rows:
                raise RuntimeError("PRODUCT_NOT_MAPPED quarantine increased after OSCN reprocess")
            _drop_backup(connection, schema)
    except Exception:
        with psycopg.connect(database_url(root)) as connection:
            _restore(connection, schema)
            _drop_backup(connection, schema)
        raise

    result = ReprocessResult(
        "REPROCESSED",
        previous_hash,
        current_hash,
        before,
        after,
        "Historical batches were rebuilt and reconciled against the updated OSCN.",
    )
    _write_state(root, result)
    return result
