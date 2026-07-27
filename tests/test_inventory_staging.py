from datetime import date
from decimal import Decimal

from esip.inventory_staging import InventorySummary, parse_snapshot_from_sheet


def test_snapshot_date_from_dh_sheet_name() -> None:
    assert parse_snapshot_from_sheet("Stock 21.3.26") == date(2026, 3, 21)


def test_inventory_reconciliation_includes_quarantine() -> None:
    summary = InventorySummary(
        source_code="DH",
        source_rows=2,
        staged_rows=1,
        quarantined_rows=1,
        duplicate_grain_rows=0,
        source_onhand_qty=Decimal("5"),
        staged_onhand_qty=Decimal("3"),
        quarantined_onhand_qty=Decimal("2"),
    )
    assert summary.reconciles
