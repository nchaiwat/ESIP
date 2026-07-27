from __future__ import annotations

import csv
from datetime import date, datetime, time as datetime_time, timezone
from decimal import Decimal
from email.parser import BytesParser
from email.policy import default as email_policy
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import heapq
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import psycopg

from esip.approvals import ApprovalResult, apply_approval_result
from esip.postgres import database_url


ROOT = Path(os.environ.get("ESIP_WORKSPACE", "/workspace")).resolve()
TOKEN = os.environ.get("ESIP_APPLY_TOKEN", "")
ALLOWED_ROLES = {"ADMINISTRATOR", "SALE_ADMIN"}
REJECTION_FIELDS = (
    "rejected_at_utc",
    "queue_kind",
    "source_code",
    "source_key",
    "candidate",
    "approval_reference",
    "actor",
)
IMPORT_SOURCES = ("DH", "GBH", "HH", "HP_MH", "TWD", "TA")
IMPORT_DIRS = {
    source: ROOT / "SourceFiles" / source / "incoming" for source in IMPORT_SOURCES
}
IMPORT_LOG = ROOT / "output" / "operations" / "import_history.jsonl"
IMPORT_STATE = ROOT / "output" / "operations" / "import_scheduler.json"
IMPORT_LOCK = threading.Lock()
PENDING_CACHE_LOCK = threading.Lock()
PENDING_CACHE: dict[str, object] = {"expires_at": 0.0, "rows": []}
SCHEDULE_ENABLED = os.environ.get("ESIP_AUTO_IMPORT_ENABLED", "true").lower() == "true"
SCHEDULE_TIME = os.environ.get("ESIP_AUTO_IMPORT_TIME", "08:00")
EXTERNAL_SCHEDULE_ENABLED = (
    os.environ.get("ESIP_EXTERNAL_SCHEDULER_ENABLED", "false").lower() == "true"
)
TELEGRAM_TOKEN = os.environ.get("ESIP_TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("ESIP_TELEGRAM_CHAT_ID", "").strip()
BANGKOK = ZoneInfo("Asia/Bangkok")


def json_value(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def read_json(path: Path, fallback: object) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def append_import_event(event: dict[str, object]) -> None:
    IMPORT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with IMPORT_LOG.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, ensure_ascii=False) + "\n")


def import_history() -> list[dict[str, object]]:
    if not IMPORT_LOG.is_file():
        return []
    events = []
    for line in IMPORT_LOG.read_text(encoding="utf-8").splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(events[-100:]))


def safe_filename(filename: str) -> str:
    name = Path(filename.replace("\\", "/")).name.strip()
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]", "_", name)
    if not name or name in {".", ".."}:
        raise ValueError("Invalid filename")
    return name[:220]


def detect_source(filename: str) -> tuple[str | None, str]:
    name = filename.lower()
    if "salesdata" in name or "inventorydata" in name or name.endswith(".csv.zip"):
        return "HP_MH", "HP/MH export filename"
    if "salereport" in name or "stockreport" in name:
        return "HH", "HomeHub report filename"
    if "ยอดขาย" in filename or "สต็อค" in filename or "stockall" in name:
        return "DH", "DoHome report filename"
    if "piyawat" in name or "runglawan" in name:
        return "GBH", "Global House owner export filename"
    if name.endswith(".xls"):
        return "TWD", "Thai Watsadu .xls format"
    return None, "Filename is ambiguous; select MT before upload"


def pending_files(force_refresh: bool = False) -> list[dict[str, object]]:
    now = time.monotonic()
    with PENDING_CACHE_LOCK:
        if not force_refresh and now < float(PENDING_CACHE["expires_at"]):
            return list(PENDING_CACHE["rows"])

    latest_run = read_json(ROOT / "output" / "daily_runs" / "latest_run.json", {})
    last_started = str(latest_run.get("started_at", "")) if isinstance(latest_run, dict) else ""
    candidates: list[tuple[float, str, str, int]] = []
    for source, directory in IMPORT_DIRS.items():
        if not directory.is_dir():
            continue
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    try:
                        if not entry.is_file():
                            continue
                        stat = entry.stat()
                        candidates.append((stat.st_mtime, source, entry.name, stat.st_size))
                    except OSError:
                        continue
        except OSError:
            continue

    rows: list[dict[str, object]] = []
    for modified_timestamp, source, filename, size in heapq.nlargest(
        250,
        candidates,
        key=lambda item: item[0],
    ):
        modified = datetime.fromtimestamp(modified_timestamp).astimezone()
        rows.append(
                {
                    "source": source,
                    "filename": filename,
                    "size": size,
                    "modified_at": modified.isoformat(timespec="seconds"),
                    "pending": not last_started or modified.isoformat() > last_started,
                }
            )
    with PENDING_CACHE_LOCK:
        PENDING_CACHE["rows"] = rows
        PENDING_CACHE["expires_at"] = time.monotonic() + 30
    return list(rows)


def telegram_notify(message: str) -> dict[str, object]:
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {"configured": False, "sent": False}
    data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": message}).encode("utf-8")
    request = Request(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
        data=data,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            return {"configured": True, "sent": response.status == 200}
    except Exception as error:
        return {"configured": True, "sent": False, "error": str(error)}


def telegram_message(title: str, lines: list[str], icon: str = "📊") -> str:
    now = datetime.now(BANGKOK)
    thai_months = (
        "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
        "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    )
    header = (
        f"{icon} ESIP · {now.day} {thai_months[now.month - 1]} "
        f"{now.year + 543} {now:%H:%M} น."
    )
    return "\n".join((header, "━━━━━━━━━━━━━━━━━━", title, *lines))


def run_import(trigger: str, actor: str) -> dict[str, object]:
    if not IMPORT_LOCK.acquire(blocking=False):
        raise ValueError("Another import is already running")
    started = datetime.now(BANGKOK)
    run_id = started.strftime("%Y%m%d_%H%M%S")
    try:
        commands = [
            [sys.executable, "scripts/refresh_manifest.py"],
            [sys.executable, "-m", "esip.cli", "verify-manifest"],
            [sys.executable, "-m", "esip.cli", "postgres-status"],
            [sys.executable, "-m", "esip.cli", "postgres-load-master"],
            [sys.executable, "scripts/reprocess_after_oscn.py"],
            [sys.executable, "-m", "esip.cli", "postgres-load-hp-mh"],
            [sys.executable, "-m", "esip.cli", "postgres-load-twd"],
            [sys.executable, "-m", "esip.cli", "postgres-load-hh"],
            [sys.executable, "-m", "esip.cli", "postgres-load-gbh"],
            [sys.executable, "-m", "esip.cli", "postgres-load-dh"],
            [sys.executable, "scripts/export_mapping_work_queues.py"],
            [sys.executable, "scripts/check_mapping_candidates.py"],
            [sys.executable, "scripts/export_publication_queue.py"],
            [sys.executable, "scripts/export_preview_data.py"],
        ]
        output: list[str] = []
        status = "PASS"
        for command in commands:
            completed = subprocess.run(
                command,
                cwd=ROOT,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                check=False,
                timeout=1800,
            )
            output.append((completed.stdout + "\n" + completed.stderr).strip()[-1200:])
            if completed.returncode != 0:
                status = "FAIL"
                break
        event = {
            "run_id": run_id,
            "trigger": trigger,
            "actor": actor,
            "status": status,
            "started_at": started.isoformat(timespec="seconds"),
            "finished_at": datetime.now(BANGKOK).isoformat(timespec="seconds"),
            "files": [row for row in pending_files() if row["pending"]],
            "detail": output[-1] if output else "",
        }
        append_import_event(event)
        names = ", ".join(str(row["filename"]) for row in event["files"][:15]) or "no new files"
        status_icon = "✅" if status == "PASS" else "🚨"
        event["telegram"] = telegram_notify(
            telegram_message(
                f"{status_icon} อัปเดตข้อมูล {status}",
                [
                    f"📥 วิธีนำเข้า: {trigger}",
                    f"📄 ไฟล์: {names}",
                    f"🔖 Run: {run_id}",
                    "📈 Dashboard อัปเดตแล้ว" if status == "PASS" else "🔎 กรุณาตรวจสอบ Import History",
                ],
                "🏢",
            )
        )
        return event
    finally:
        IMPORT_LOCK.release()


def scheduler_status() -> dict[str, object]:
    state = read_json(IMPORT_STATE, {})
    return {
        "enabled": SCHEDULE_ENABLED or EXTERNAL_SCHEDULE_ENABLED,
        "time": SCHEDULE_TIME,
        "timezone": "Asia/Bangkok",
        "last_scheduled_date": state.get("last_scheduled_date") if isinstance(state, dict) else None,
        "telegram_configured": bool(TELEGRAM_TOKEN and TELEGRAM_CHAT_ID),
        "running": IMPORT_LOCK.locked(),
        "mode": "WINDOWS_NAS_TASK" if EXTERNAL_SCHEDULE_ENABLED else "INTERNAL",
    }


def scheduler_loop() -> None:
    while True:
        try:
            now = datetime.now(BANGKOK)
            hour, minute = (int(part) for part in SCHEDULE_TIME.split(":", 1))
            state = read_json(IMPORT_STATE, {})
            last_date = state.get("last_scheduled_date") if isinstance(state, dict) else None
            if (
                SCHEDULE_ENABLED
                and now.time() >= datetime_time(hour, minute)
                and last_date != now.date().isoformat()
            ):
                run_import("SCHEDULE", "ESIP Scheduler")
                IMPORT_STATE.parent.mkdir(parents=True, exist_ok=True)
                IMPORT_STATE.write_text(
                    json.dumps({"last_scheduled_date": now.date().isoformat()}),
                    encoding="utf-8",
                )
        except Exception as error:
            append_import_event(
                {
                    "run_id": datetime.now().strftime("%Y%m%d_%H%M%S"),
                    "trigger": "SCHEDULE",
                    "actor": "ESIP Scheduler",
                    "status": "FAIL",
                    "detail": str(error),
                }
            )
        time.sleep(30)


def query(cursor: psycopg.Cursor, sql: str) -> list[dict[str, object]]:
    cursor.execute(sql)
    columns = [item.name for item in cursor.description or ()]
    return [
        {column: json_value(value) for column, value in zip(columns, row, strict=True)}
        for row in cursor.fetchall()
    ]


def master_search(params: dict[str, list[str]]) -> dict[str, object]:
    kind = params.get("kind", ["branch"])[0].lower()
    search = params.get("q", [""])[0].strip()
    if len(search) < 2:
        return {"items": []}
    with psycopg.connect(database_url(ROOT)) as connection:
        with connection.cursor() as cursor:
            if kind == "product":
                cursor.execute(
                    """SELECT sap_item_code AS code, item_name AS name
                    FROM dim_product
                    WHERE sap_item_code ILIKE %s OR item_name ILIKE %s
                    ORDER BY sap_item_code LIMIT 20""",
                    (f"%{search}%", f"%{search}%"),
                )
            else:
                cursor.execute(
                    """SELECT sap_card_code AS code, branch_name AS name
                    FROM dim_branch
                    WHERE sap_card_code ILIKE %s OR branch_name ILIKE %s
                    ORDER BY sap_card_code LIMIT 20""",
                    (f"%{search}%", f"%{search}%"),
                )
            return {"items": query(cursor, "SELECT 1 WHERE FALSE") if False else [
                {"code": row[0], "name": row[1]} for row in cursor.fetchall()
            ]}


def validate_override_candidate(queue_kind: str, candidate: str) -> None:
    table, column = (
        ("dim_product", "sap_item_code")
        if queue_kind == "PRODUCT"
        else ("dim_branch", "sap_card_code")
    )
    with psycopg.connect(database_url(ROOT)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT 1 FROM {table} WHERE {column} = %s LIMIT 1",
                (candidate,),
            )
            if cursor.fetchone() is None:
                label = "Item Master" if queue_kind == "PRODUCT" else "Branch Master"
                raise ValueError(f"{candidate} was not found in {label}")


def dashboard_summary_file() -> dict[str, object] | None:
    path = ROOT / ".tmp_review" / "dashboard_data.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def dashboard_data() -> dict[str, object]:
    summary = dashboard_summary_file()
    if summary is not None:
        return summary
    with psycopg.connect(database_url(ROOT)) as connection:
        with connection.cursor() as cursor:
            return {
                "coverage": query(
                    cursor,
                    """SELECT MIN(sales_date) AS first_date, MAX(sales_date) AS last_date,
                    COUNT(DISTINCT sales_date) AS available_days,
                    COUNT(*) AS sales_rows,
                    COALESCE(SUM(sales_qty), 0) AS sales_qty,
                    COALESCE(SUM(sales_amount_ex_vat_after_discount), 0) AS sales_amount
                    FROM fact_sales""",
                )[0],
                "trend": query(
                    cursor,
                    """SELECT sales_date, SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales GROUP BY sales_date ORDER BY sales_date""",
                ),
                "source_sales": query(
                    cursor,
                    """SELECT source_code, MIN(sales_date) AS first_date,
                    MAX(sales_date) AS last_date, COUNT(DISTINCT sales_date) AS available_days,
                    SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales GROUP BY source_code ORDER BY net_amount DESC""",
                ),
                "top_branches": query(
                    cursor,
                    """SELECT source_code, branch_source_name,
                    SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales GROUP BY source_code, branch_source_name
                    ORDER BY net_amount DESC LIMIT 15""",
                ),
                "top_products": query(
                    cursor,
                    """SELECT sap_item_code, MAX(product_source_code) AS source_sku,
                    SUM(sales_qty) AS net_qty,
                    SUM(sales_amount_ex_vat_after_discount) AS net_amount
                    FROM fact_sales WHERE sap_item_code IS NOT NULL
                    GROUP BY sap_item_code ORDER BY net_amount DESC LIMIT 15""",
                ),
                "inventory": query(
                    cursor,
                    """WITH latest AS (
                        SELECT source_code, MAX(snapshot_date) AS snapshot_date
                        FROM fact_inventory_snapshot GROUP BY source_code
                    )
                    SELECT i.source_code, l.snapshot_date,
                    SUM(i.onhand_qty) AS onhand_qty,
                    SUM(i.onhand_value) AS onhand_value
                    FROM fact_inventory_snapshot i
                    JOIN latest l USING(source_code, snapshot_date)
                    GROUP BY i.source_code, l.snapshot_date ORDER BY i.source_code""",
                ),
                "data_quality": query(
                    cursor,
                    """SELECT source_code,
                    CASE WHEN COALESCE(SUM(sales_amount_ex_vat_after_discount), 0) = 0
                         THEN 'SALES_AMOUNT_ZERO' ELSE 'OK' END AS issue,
                    COUNT(*) AS affected_rows
                    FROM fact_sales GROUP BY source_code
                    HAVING COALESCE(SUM(sales_amount_ex_vat_after_discount), 0) = 0
                    ORDER BY source_code""",
                ),
                "reference_coverage": [
                    {
                        "report": "Daily / Monthly Sales Trend",
                        "status": "AVAILABLE",
                        "note": "Uses all Daily Raw dates currently loaded",
                    },
                    {
                        "report": "MT Comparison, Top Branch, Top SKU",
                        "status": "AVAILABLE",
                        "note": "Current available period",
                    },
                    {
                        "report": "Stock on Hand",
                        "status": "AVAILABLE",
                        "note": "Latest snapshot for each MT",
                    },
                    {
                        "report": "YoY 2025 vs 2026",
                        "status": "WAITING_DATA",
                        "note": "Requires matching 2025 Daily Raw",
                    },
                    {
                        "report": "Gross Profit / Margin",
                        "status": "WAITING_DATA",
                        "note": "Requires Cost / COGS",
                    },
                    {
                        "report": "Target / Forecast / Achievement",
                        "status": "WAITING_DATA",
                        "note": "Requires Target and Forecast inputs",
                    },
                    {
                        "report": "Stock on Order / Last Receive",
                        "status": "WAITING_DATA",
                        "note": "Requires order and receipt history",
                    },
                ],
            }


def applied_and_rejected_keys() -> tuple[set[tuple[str, str, str]], set[tuple[str, str, str]]]:
    applied = {
        (
            row.get("entity_type", ""),
            row.get("source_code", ""),
            row.get("source_key", ""),
        )
        for row in read_csv(ROOT / "output" / "operations" / "approval_audit_log.csv")
    }
    rejected = {
        (
            row.get("queue_kind", ""),
            row.get("source_code", ""),
            row.get("source_key", ""),
        )
        for row in read_csv(ROOT / "output" / "operations" / "approval_rejections.csv")
    }
    return applied, rejected


def queue_items(params: dict[str, list[str]]) -> dict[str, object]:
    queue_kind = params.get("type", ["all"])[0].lower()
    source_filter = params.get("source", [""])[0].upper()
    search = params.get("search", [""])[0].strip().lower()
    limit = min(max(int(params.get("limit", ["100"])[0]), 1), 500)
    offset = max(int(params.get("offset", ["0"])[0]), 0)
    applied, rejected = applied_and_rejected_keys()
    items: list[dict[str, object]] = []

    if queue_kind in {"all", "product"}:
        for index, row in enumerate(
            read_csv(ROOT / "output" / "operations" / "product_mapping_queue.csv"),
            start=1,
        ):
            source = row.get("source_code", "").upper()
            source_key = row.get("source_product_code", "")
            if ("PRODUCT", source, source_key) in applied:
                continue
            if ("PRODUCT", source, source_key) in rejected:
                continue
            candidates = [
                value.strip()
                for value in row.get("candidate_sap_item_codes", "").split("|")
                if value.strip()
            ]
            if len(candidates) != 1:
                continue
            items.append(
                {
                    "id": f"P-{index}",
                    "queue_kind": "PRODUCT",
                    "category": "PRODUCT_MAPPING",
                    "source_code": source,
                    "subject": source_key,
                    "candidate": candidates[0],
                    "evidence": row.get("candidate_basis", ""),
                    "priority": row.get("priority_tier", "P4").split("_", 1)[0],
                    "affected_rows": int(float(row.get("total_affected_rows") or 0)),
                    "status": "PENDING",
                    "recommended_action": row.get("recommended_action", ""),
                }
            )

    if queue_kind in {"all", "branch"}:
        for index, row in enumerate(
            read_csv(ROOT / "output" / "operations" / "branch_mapping_approval_queue.csv"),
            start=1,
        ):
            source = row.get("source_code", "").upper()
            source_key = row.get("branch_source_code", "") or row.get(
                "branch_source_name", ""
            )
            if ("BRANCH", source, source_key) in applied:
                continue
            if ("BRANCH", source, source_key) in rejected:
                continue
            candidate = row.get("candidate_card_code", "")
            if not candidate:
                continue
            items.append(
                {
                    "id": f"B-{index}",
                    "queue_kind": "BRANCH",
                    "category": "BRANCH_MAPPING",
                    "source_code": source,
                    "subject": source_key,
                    "branch_source_code": row.get("branch_source_code", ""),
                    "branch_source_name": row.get("branch_source_name", ""),
                    "candidate": candidate,
                    "evidence": row.get("candidate_basis", ""),
                    "priority": row.get("priority_tier", "P4").split("_", 1)[0],
                    "affected_rows": int(float(row.get("affected_rows") or 0)),
                    "status": "PENDING",
                    "confidence_score": row.get("similarity_score", ""),
                }
            )

    if source_filter:
        items = [item for item in items if item["source_code"] == source_filter]
    if search:
        items = [
            item
            for item in items
            if search
            in " ".join(
                str(item.get(key, ""))
                for key in ("source_code", "subject", "candidate", "evidence")
            ).lower()
        ]
    items.sort(
        key=lambda item: (
            {"P1": 0, "P2": 1, "P3": 2, "P4": 3}.get(str(item["priority"]), 9),
            -int(item["affected_rows"]),
        )
    )
    return {"items": items[offset : offset + limit], "total": len(items)}


def validate_role(payload: dict[str, Any]) -> None:
    if str(payload.get("role") or "") not in ALLOWED_ROLES:
        raise PermissionError("Administrator or Sale Admin permission is required")


def apply_confirmation(payload: dict[str, Any]) -> dict[str, str]:
    validate_role(payload)
    confirmation = payload.get("confirmation")
    if not isinstance(confirmation, dict):
        raise ValueError("Confirmation payload is required")
    reference = str(payload.get("reference") or "").strip()
    if len(reference) < 3:
        raise ValueError("Approval reference is required")

    queue_kind = str(confirmation.get("queue_kind") or "")
    source_code = str(confirmation.get("source_code") or "").strip().upper()
    source_key = str(confirmation.get("subject") or "").strip()
    suggested_candidate = str(confirmation.get("candidate") or "").strip().upper()
    candidate = str(payload.get("override_candidate") or suggested_candidate).strip().upper()
    is_override = candidate != suggested_candidate
    if is_override:
        validate_override_candidate(queue_kind, candidate)

    if queue_kind == "PRODUCT":
        queue = read_csv(ROOT / "output" / "operations" / "product_mapping_queue.csv")
        queue_row = next(
            (
                row
                for row in queue
                if row.get("source_code", "").upper() == source_code
                and row.get("source_product_code", "") == source_key
            ),
            None,
        )
        if queue_row is None:
            raise ValueError("The product is not in the current governed queue")
        queue_candidates = [
            value.strip().upper()
            for value in queue_row.get("candidate_sap_item_codes", "").split("|")
            if value.strip()
        ]
        if not is_override and queue_candidates != [candidate]:
            raise ValueError("The candidate no longer matches the governed queue")
        result = ApprovalResult(
            approved_branches=(),
            approved_products=(
                {
                    "source_code": source_code,
                    "source_product_code": source_key,
                    "proposed_sap_item_code": candidate,
                    "recommended_action": (
                        f"ADMIN_OVERRIDE_FROM_{suggested_candidate}"
                        if is_override
                        else queue_row.get("recommended_action", "")
                    ),
                    "approval_reference": reference,
                    "request_status": "READY_FOR_SAP_ADMIN",
                },
            ),
            rejected_branches=0,
            rejected_products=0,
            issues=(),
        )
    elif queue_kind == "BRANCH":
        queue = read_csv(
            ROOT / "output" / "operations" / "branch_mapping_approval_queue.csv"
        )
        queue_row = next(
            (
                row
                for row in queue
                if row.get("source_code", "").upper() == source_code
                and (
                    row.get("branch_source_code", "") == source_key
                    or (
                        not row.get("branch_source_code", "")
                        and row.get("branch_source_name", "") == source_key
                    )
                )
            ),
            None,
        )
        if queue_row is None:
            raise ValueError("The branch is not in the current governed queue")
        if not is_override and queue_row.get("candidate_card_code", "").upper() != candidate:
            raise ValueError("The branch candidate no longer matches the governed queue")
        result = ApprovalResult(
            approved_branches=(
                {
                    "source_code": source_code,
                    "branch_source_code": queue_row.get("branch_source_code", ""),
                    "branch_source_name": queue_row.get("branch_source_name", ""),
                    "sap_card_code": candidate,
                    "mapping_status": "APPROVED",
                    "approval_reference": reference,
                },
            ),
            approved_products=(),
            rejected_branches=0,
            rejected_products=0,
            issues=(),
        )
    else:
        raise ValueError("Unknown governed queue type")

    if payload.get("dry_run") is True:
        return {"status": "VALIDATED", "message": "Validation passed; no files changed"}
    branches, products = apply_approval_result(ROOT, result)
    return {
        "status": "APPLIED",
        "message": f"Applied immediately: {products} product(s), {branches} branch(es)",
    }


def reject_confirmation(payload: dict[str, Any]) -> dict[str, str]:
    validate_role(payload)
    confirmation = payload.get("confirmation")
    if not isinstance(confirmation, dict):
        raise ValueError("Confirmation payload is required")
    reference = str(payload.get("reference") or "").strip()
    if len(reference) < 3:
        raise ValueError("Approval reference is required")
    path = ROOT / "output" / "operations" / "approval_rejections.csv"
    existing = read_csv(path)
    row = {
        "rejected_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "queue_kind": str(confirmation.get("queue_kind") or ""),
        "source_code": str(confirmation.get("source_code") or ""),
        "source_key": str(confirmation.get("subject") or ""),
        "candidate": str(confirmation.get("candidate") or ""),
        "approval_reference": reference,
        "actor": str(payload.get("actor") or ""),
    }
    key = (row["queue_kind"], row["source_code"], row["source_key"])
    if not any(
        (item.get("queue_kind"), item.get("source_code"), item.get("source_key")) == key
        for item in existing
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=REJECTION_FIELDS)
            if path.stat().st_size == 0:
                writer.writeheader()
            writer.writerow(row)
    return {"status": "REJECTED", "message": "Rejected and removed from active queue"}


def audit_events() -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for index, row in enumerate(
        read_csv(ROOT / "output" / "operations" / "approval_audit_log.csv"), start=1
    ):
        events.append(
            {
                "id": f"A-{index}",
                "action": "APPROVED",
                "actor_email": "ESIP governed apply",
                "detail": (
                    f"{row.get('entity_type')} {row.get('source_code')}/"
                    f"{row.get('source_key')} -> {row.get('target_sap_code')}; "
                    f"reference={row.get('approval_reference')}"
                ),
                "created_at": row.get("applied_at_utc", ""),
            }
        )
    for index, row in enumerate(
        read_csv(ROOT / "output" / "operations" / "approval_rejections.csv"), start=1
    ):
        events.append(
            {
                "id": f"R-{index}",
                "action": "REJECTED",
                "actor_email": row.get("actor", ""),
                "detail": (
                    f"{row.get('queue_kind')} {row.get('source_code')}/"
                    f"{row.get('source_key')}; reference={row.get('approval_reference')}"
                ),
                "created_at": row.get("rejected_at_utc", ""),
            }
        )
    return sorted(events, key=lambda event: str(event["created_at"]), reverse=True)[:100]


class Handler(BaseHTTPRequestHandler):
    server_version = "ESIPApplyBridge/2.0"

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"{self.address_string()} - {format_string % args}", flush=True)

    def cors_headers(self) -> None:
        self.send_header("access-control-allow-origin", "http://localhost:3000")
        self.send_header("access-control-allow-headers", "authorization, content-type, x-esip-role, x-esip-actor, x-esip-source")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")

    def send_json(self, status: HTTPStatus, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.cors_headers()
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/health":
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            elif parsed.path == "/data":
                self.send_json(HTTPStatus.OK, dashboard_data())
            elif parsed.path == "/queue":
                self.send_json(HTTPStatus.OK, queue_items(parse_qs(parsed.query)))
            elif parsed.path == "/audit":
                self.send_json(HTTPStatus.OK, {"events": audit_events()})
            elif parsed.path == "/master-search":
                self.send_json(HTTPStatus.OK, master_search(parse_qs(parsed.query)))
            elif parsed.path == "/imports":
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "pending_files": pending_files(),
                        "history": import_history(),
                        "scheduler": scheduler_status(),
                        "sources": IMPORT_SOURCES,
                    },
                )
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except Exception as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def do_POST(self) -> None:
        if self.headers.get("authorization") != f"Bearer {TOKEN}" or not TOKEN:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Invalid bridge token"})
            return
        try:
            if self.path == "/upload":
                role = self.headers.get("x-esip-role", "")
                if role not in ALLOWED_ROLES:
                    raise PermissionError("Administrator or Sale Admin permission is required")
                content_length = int(self.headers.get("content-length", "0"))
                if content_length <= 0 or content_length > 250 * 1024 * 1024:
                    raise ValueError("Upload must be between 1 byte and 250 MB")
                raw = self.rfile.read(content_length)
                message = BytesParser(policy=email_policy).parsebytes(
                    b"Content-Type: " + self.headers.get("content-type", "").encode() + b"\r\n\r\n" + raw
                )
                part = next((item for item in message.iter_attachments()), None)
                if part is None or not part.get_filename():
                    raise ValueError("No file was received")
                filename = safe_filename(part.get_filename())
                selected = self.headers.get("x-esip-source", "AUTO").upper()
                detected, reason = detect_source(filename)
                source = detected if selected == "AUTO" else selected
                if source not in IMPORT_SOURCES:
                    raise ValueError(reason)
                content = part.get_payload(decode=True) or b""
                if not content:
                    raise ValueError("Uploaded file is empty")
                directory = IMPORT_DIRS[source]
                directory.mkdir(parents=True, exist_ok=True)
                target = directory / filename
                if target.exists():
                    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    suffixes = "".join(target.suffixes)
                    base = target.name[: -len(suffixes)] if suffixes else target.name
                    target = directory / f"{base}_{stamp}{suffixes}"
                target.write_bytes(content)
                append_import_event(
                    {
                        "run_id": datetime.now().strftime("%Y%m%d_%H%M%S"),
                        "trigger": "UPLOAD",
                        "actor": self.headers.get("x-esip-actor", ""),
                        "status": "STAGED",
                        "source": source,
                        "filename": target.name,
                        "detail": reason if detected else "MT selected manually",
                    }
                )
                result = {
                    "status": "STAGED",
                    "source": source,
                    "filename": target.name,
                    "message": f"{target.name} is ready in {source}",
                }
            else:
                content_length = int(self.headers.get("content-length", "0"))
                payload = json.loads(self.rfile.read(content_length) or b"{}")
            if self.path == "/apply":
                result = apply_confirmation(payload)
            elif self.path == "/reject":
                result = reject_confirmation(payload)
            elif self.path == "/process":
                if self.headers.get("x-esip-role", "") not in ALLOWED_ROLES:
                    raise PermissionError("Administrator or Sale Admin permission is required")
                result = run_import(
                    str(payload.get("trigger") or "MANUAL"),
                    str(payload.get("actor") or ""),
                )
            elif self.path == "/telegram-test":
                if self.headers.get("x-esip-role", "") != "ADMINISTRATOR":
                    raise PermissionError("Administrator permission is required")
                result = telegram_notify(
                    telegram_message(
                        "✅ เชื่อมต่อ Telegram สำเร็จ",
                        [
                            "🔔 ระบบพร้อมแจ้งผลการนำเข้าข้อมูล",
                            "⏰ รอบอัตโนมัติทุกวัน 08:00 น.",
                            "👤 ผู้รับ: ESIP Admin",
                        ],
                        "🏢",
                    )
                )
                if not result.get("configured"):
                    raise ValueError("Telegram Bot Token and Chat ID are not configured")
            elif self.path == "/upload":
                pass
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
                return
            self.send_json(HTTPStatus.OK, result)
        except PermissionError as error:
            self.send_json(HTTPStatus.FORBIDDEN, {"error": str(error)})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": str(error)})
        except Exception as error:
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"Operation failed safely: {error}"},
            )


if __name__ == "__main__":
    threading.Thread(target=scheduler_loop, daemon=True, name="esip-scheduler").start()
    ThreadingHTTPServer(("0.0.0.0", 8090), Handler).serve_forever()
