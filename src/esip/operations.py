from __future__ import annotations

import csv
import sqlite3
from pathlib import Path


OPERATIONAL_VIEWS = (
    "vw_batch_health",
    "vw_dataset_coverage",
    "vw_quarantine_operations",
    "vw_product_master_completeness",
    "vw_branch_crosswalk_coverage",
)


def export_view(connection: sqlite3.Connection, view_name: str, output_path: Path) -> int:
    if view_name not in OPERATIONAL_VIEWS:
        raise ValueError(f"view {view_name!r} is not approved for operational export")
    cursor = connection.execute(f"SELECT * FROM {view_name}")
    columns = [item[0] for item in cursor.description]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with output_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(columns)
        for row in cursor:
            writer.writerow(row)
            count += 1
    return count


def export_operational_views(database_path: Path, output_dir: Path) -> dict[str, int]:
    connection = sqlite3.connect(database_path)
    try:
        return {
            view_name: export_view(
                connection, view_name, output_dir / f"{view_name.removeprefix('vw_')}.csv"
            )
            for view_name in OPERATIONAL_VIEWS
        }
    finally:
        connection.close()
