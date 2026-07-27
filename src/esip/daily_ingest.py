from __future__ import annotations

import csv
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile

import psycopg
import xlrd

from esip.master_data import OscnRecord, load_oscn
from esip.postgres import database_url


@dataclass(frozen=True)
class IngestSummary:
    source_code: str
    dataset: str
    source_rows: int
    staged_rows: int
    quarantined_rows: int
    source_measure: Decimal
    staged_measure: Decimal
    quarantined_measure: Decimal
    batch_id: str
    skipped_existing: bool = False


def existing_batch_summaries(root: Path, batch_id: str) -> list[IngestSummary]:
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT b.source_code,r.dataset,r.source_rows,r.staged_rows,
                r.quarantined_rows,r.source_measure,r.staged_measure,
                r.quarantined_measure
                FROM import_batch b
                JOIN batch_reconciliation r USING(import_batch_id)
                WHERE b.import_batch_id=%s
                ORDER BY r.dataset""",
                (batch_id,),
            )
            rows = cursor.fetchall()
    return [
        IngestSummary(
            source_code,
            dataset,
            source_rows,
            staged_rows,
            quarantined_rows,
            source_measure,
            staged_measure,
            quarantined_measure,
            batch_id,
            True,
        )
        for (
            source_code,
            dataset,
            source_rows,
            staged_rows,
            quarantined_rows,
            source_measure,
            staged_measure,
            quarantined_measure,
        ) in rows
    ]


def _clean_excel_text(value: str | None) -> str:
    text = (value or "").strip()
    if text.startswith('="') and text.endswith('"'):
        return text[2:-1].strip()
    return text


def _decimal(value: str | None) -> Decimal:
    return Decimal((value or "0").replace(",", "").strip() or "0")


def _oscn_index(records: list[OscnRecord], card_prefix: str) -> dict[str, str | None]:
    grouped: dict[str, set[str]] = {}
    for record in records:
        if record.card_code.upper().startswith(card_prefix):
            for key in (record.customer_sku, record.partner_barcode):
                normalized = _clean_excel_text(key)
                if normalized:
                    grouped.setdefault(normalized, set()).add(record.item_code)
    return {
        key: next(iter(items)) if len(items) == 1 else None
        for key, items in grouped.items()
    }


def _read_zip_csv(path: Path) -> tuple[str, list[dict[str, str]]]:
    with ZipFile(path) as archive:
        name = archive.namelist()[0]
        text = archive.read(name).decode("utf-8-sig")
    return name, list(csv.DictReader(text.splitlines()[1:]))


def _find_sap_item(row: dict[str, str], index: dict[str, str | None]) -> str | None:
    for column in ("VDARTNO", "ARTEAN", "ARTNO"):
        candidate = _clean_excel_text(row.get(column))
        if candidate and index.get(candidate):
            return index[candidate]
    return None


def ingest_hp_mh(root: Path) -> list[IngestSummary]:
    incoming = root / "SourceFiles" / "HP_MH" / "incoming"
    oscn_path = (
        root
        / "MasterData"
        / "OSCN"
        / "incoming"
        / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx"
    )
    oscn: list[OscnRecord] | None = None
    summaries: list[IngestSummary] = []
    for path in sorted(incoming.glob("*.csv.zip")):
        dataset = "sales" if "SalesData" in path.name else "inventory"
        digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
        existing = {
            source_code: existing_batch_summaries(
                root, f"{source_code}-{dataset}-{digest[:16]}"
            )
            for source_code in ("HP", "MH")
        }
        if all(existing.values()):
            summaries.extend(existing["HP"])
            summaries.extend(existing["MH"])
            continue
        member_name, rows = _read_zip_csv(path)
        if oscn is None:
            oscn, _ = load_oscn(oscn_path)
        for source_code, prefix in (("HP", "CHP"), ("MH", "CMH")):
            if existing[source_code]:
                summaries.extend(existing[source_code])
                continue
            source_rows = [
                (row_no, row)
                for row_no, row in enumerate(rows, start=3)
                if (row.get("SITENO", "").startswith("M")) == (source_code == "MH")
            ]
            batch_id = f"{source_code}-{dataset}-{digest[:16]}"
            summary = _ingest_hp_mh_partition(
                root, path, member_name, source_code, prefix, dataset, digest,
                batch_id, source_rows, _oscn_index(oscn, prefix)
            )
            summaries.append(summary)
    return summaries


def _ingest_twd_file(root: Path, path: Path) -> list[IngestSummary]:
    if path.stat().st_size == 0:
        return [
            IngestSummary(
                "TWD", "empty_file", 0, 0, 0, Decimal(), Decimal(), Decimal(),
                f"TWD-empty-{path.name}", True
            )
        ]
    digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
    batch_id = f"TWD-combined-{digest[:16]}"
    existing = existing_batch_summaries(root, batch_id)
    if existing:
        return existing
    workbook = xlrd.open_workbook(path, on_demand=True)
    sheet = workbook.sheet_by_name("ReportSaleSubscription")
    report_date = datetime.strptime(str(sheet.cell_value(2, 1)), "%a,%d %b %Y").date()
    raw_rows = [(row_no + 1, sheet.row_values(row_no)) for row_no in range(6, sheet.nrows)]
    workbook.release_resources()
    oscn_path = (
        root / "MasterData" / "OSCN" / "incoming"
        / "All OSCN Before add 6 Row for all CTW req by Pun 2026-06-19.xlsx"
    )
    oscn, _ = load_oscn(oscn_path)
    mapping = _oscn_index(oscn, "CTW")
    prepared = []
    for row_no, row in raw_rows:
        sku = _clean_excel_text(str(row[5]))
        barcode = _clean_excel_text(str(row[6]))
        sap_item = mapping.get(sku) or mapping.get(barcode)
        branch_name = str(row[0]).strip()
        branch_code = branch_name.split("-", 1)[0].strip()
        prepared.append((row_no, row, sku, sap_item, branch_code, branch_name))
    summaries: list[IngestSummary] = []
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM import_batch WHERE import_batch_id=%s", (batch_id,))
            if cursor.fetchone():
                return [
                    IngestSummary("TWD", name, len(raw_rows), 0, 0, Decimal(), Decimal(),
                                  Decimal(), batch_id, True)
                    for name in ("sales", "inventory")
                ]
            cursor.execute(
                "INSERT INTO import_batch VALUES (%s,'TWD',%s,%s,%s,'RECEIVED')",
                (batch_id, path.name, digest, datetime.now(timezone.utc)),
            )
            cursor.execute(
                """INSERT INTO batch_governance VALUES
                (%s,'DAILY_RAW','EVIDENCE_BASED_DRAFT','PENDING_ADMIN',NULL)""",
                (batch_id,),
            )
            for dataset, measure_index in (("sales", 10), ("inventory", 12)):
                source_measure = sum(
                    (_decimal(str(item[1][measure_index])) for item in prepared), Decimal()
                )
                facts = []
                quarantine = []
                quarantine_measure = Decimal()
                for row_no, row, sku, sap_item, branch_code, branch_name in prepared:
                    measure = _decimal(str(row[measure_index]))
                    if not sap_item:
                        quarantine.append(
                            (
                                "TWD", dataset, "PRODUCT_NOT_MAPPED",
                                "No unique CTW OSCN match from SKU or Barcode",
                                json.dumps(
                                    {"sku": sku, "barcode": str(row[6]), "branch": branch_name},
                                    ensure_ascii=False,
                                ),
                                batch_id, path.name, sheet.name, row_no,
                            )
                        )
                        quarantine_measure += measure
                        continue
                    common = (
                        "TWD", report_date, branch_code, branch_name, sku, sap_item,
                    )
                    if dataset == "sales":
                        qty = _decimal(str(row[11]))
                        amount = _decimal(str(row[10]))
                        kind = "RETURN" if qty < 0 or amount < 0 else "SALE"
                        facts.append(
                            common + (qty, amount, kind, batch_id, path.name, sheet.name, row_no)
                        )
                    else:
                        facts.append(
                            common + (
                                _decimal(str(row[12])), None, batch_id, path.name,
                                sheet.name, row_no,
                            )
                        )
                if dataset == "sales":
                    cursor.executemany(
                        """INSERT INTO fact_sales (
                        source_code,sales_date,branch_source_code,branch_source_name,
                        product_source_code,sap_item_code,sales_qty,
                        sales_amount_ex_vat_after_discount,record_type,import_batch_id,
                        source_file_name,source_sheet_name,source_row_no)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        facts,
                    )
                else:
                    cursor.executemany(
                        """INSERT INTO fact_inventory_snapshot (
                        source_code,snapshot_date,branch_source_code,branch_source_name,
                        product_source_code,sap_item_code,onhand_qty,onhand_value,
                        import_batch_id,source_file_name,source_sheet_name,source_row_no)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        facts,
                    )
                cursor.executemany(
                    """INSERT INTO quarantine_record (
                    source_code,dataset,reason_code,reason_detail,source_payload_json,
                    import_batch_id,source_file_name,source_sheet_name,source_row_no)
                    VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s)""",
                    quarantine,
                )
                staged_measure = source_measure - quarantine_measure
                passed = source_measure == staged_measure + quarantine_measure
                cursor.execute(
                    """INSERT INTO batch_reconciliation (
                    import_batch_id,dataset,source_rows,staged_rows,quarantined_rows,
                    source_measure,staged_measure,quarantined_measure,passed)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        batch_id, dataset, len(prepared), len(facts), len(quarantine),
                        source_measure, staged_measure, quarantine_measure, passed,
                    ),
                )
                summaries.append(
                    IngestSummary(
                        "TWD", dataset, len(prepared), len(facts), len(quarantine),
                        source_measure, staged_measure, quarantine_measure, batch_id,
                    )
                )
            cursor.execute(
                """UPDATE import_batch SET status = CASE WHEN
                (SELECT BOOL_AND(passed) FROM batch_reconciliation
                 WHERE import_batch_id=%s) THEN 'RECONCILED' ELSE 'QUARANTINED' END
                WHERE import_batch_id=%s""",
                (batch_id, batch_id),
            )
    return summaries


def ingest_twd(root: Path) -> list[IngestSummary]:
    incoming = root / "SourceFiles" / "TWD" / "incoming"
    return [
        summary
        for path in sorted(incoming.glob("*.xls"))
        for summary in _ingest_twd_file(root, path)
    ]


def _ingest_hp_mh_partition(
    root: Path,
    path: Path,
    member_name: str,
    source_code: str,
    prefix: str,
    dataset: str,
    digest: str,
    batch_id: str,
    rows: list[tuple[int, dict[str, str]]],
    mapping: dict[str, str | None],
) -> IngestSummary:
    measure_column = "VALUE" if dataset == "sales" else "ONHANDQTY"
    source_measure = sum((_decimal(row.get(measure_column)) for _, row in rows), Decimal())
    facts = []
    quarantine = []
    quarantined_measure = Decimal()
    for row_no, row in rows:
        sap_item = _find_sap_item(row, mapping)
        measure = _decimal(row.get(measure_column))
        if not sap_item:
            quarantine.append(
                (
                    source_code, dataset, "PRODUCT_NOT_MAPPED",
                    f"No unique {prefix} OSCN match from VDARTNO/ARTEAN/ARTNO",
                    json.dumps(row, ensure_ascii=False), batch_id, path.name, member_name, row_no,
                )
            )
            quarantined_measure += measure
            continue
        business_date = datetime.strptime(
            _clean_excel_text(row["PERIODDATE"]), "%d/%m/%Y"
        ).date()
        common = (
            source_code, business_date, row["SITENO"].strip(), row["SITENAME"].strip(),
            row["ARTNO"].strip(), sap_item,
        )
        if dataset == "sales":
            qty = _decimal(row.get("QTY"))
            amount = _decimal(row.get("VALUE"))
            record_type = "RETURN" if qty < 0 or amount < 0 else "SALE"
            facts.append(
                common + (qty, amount, record_type, batch_id, path.name, member_name, row_no)
            )
        else:
            facts.append(
                common + (
                    _decimal(row.get("ONHANDQTY")), _decimal(row.get("ONHANDVALUE")),
                    batch_id, path.name, member_name, row_no,
                )
            )
    staged_measure = source_measure - quarantined_measure
    with psycopg.connect(database_url(root)) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM import_batch WHERE import_batch_id=%s", (batch_id,))
            if cursor.fetchone():
                return IngestSummary(
                    source_code, dataset, len(rows), 0, 0, source_measure,
                    Decimal(), Decimal(), batch_id, True
                )
            cursor.execute(
                """INSERT INTO import_batch VALUES (%s,%s,%s,%s,%s,'RECEIVED')""",
                (batch_id, source_code, path.name, digest, datetime.now(timezone.utc)),
            )
            cursor.execute(
                """INSERT INTO batch_governance VALUES
                (%s,'DAILY_RAW','EVIDENCE_BASED_DRAFT','PENDING_ADMIN',NULL)""",
                (batch_id,),
            )
            if dataset == "sales":
                cursor.executemany(
                    """INSERT INTO fact_sales (
                    source_code,sales_date,branch_source_code,branch_source_name,
                    product_source_code,sap_item_code,sales_qty,
                    sales_amount_ex_vat_after_discount,record_type,import_batch_id,
                    source_file_name,source_sheet_name,source_row_no)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    facts,
                )
            else:
                cursor.executemany(
                    """INSERT INTO fact_inventory_snapshot (
                    source_code,snapshot_date,branch_source_code,branch_source_name,
                    product_source_code,sap_item_code,onhand_qty,onhand_value,
                    import_batch_id,source_file_name,source_sheet_name,source_row_no)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    facts,
                )
            cursor.executemany(
                """INSERT INTO quarantine_record (
                source_code,dataset,reason_code,reason_detail,source_payload_json,
                import_batch_id,source_file_name,source_sheet_name,source_row_no)
                VALUES (%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s)""",
                quarantine,
            )
            passed = source_measure == staged_measure + quarantined_measure
            cursor.execute(
                """INSERT INTO batch_reconciliation (
                import_batch_id,dataset,source_rows,staged_rows,quarantined_rows,
                source_measure,staged_measure,quarantined_measure,passed)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    batch_id, dataset, len(rows), len(facts), len(quarantine),
                    source_measure, staged_measure, quarantined_measure, passed,
                ),
            )
            cursor.execute(
                "UPDATE import_batch SET status=%s WHERE import_batch_id=%s",
                ("RECONCILED" if passed else "QUARANTINED", batch_id),
            )
    return IngestSummary(
        source_code, dataset, len(rows), len(facts), len(quarantine),
        source_measure, staged_measure, quarantined_measure, batch_id
    )
