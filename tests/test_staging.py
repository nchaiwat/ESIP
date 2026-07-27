from datetime import date
from decimal import Decimal

from esip.master_data import OscnRecord
from esip.staging import StagingSummary, build_oscn_index, parse_decimal, parse_sales_date


def test_parse_supported_sales_periods() -> None:
    assert parse_sales_date({"sales_period": "Jan'25"}) == date(2025, 1, 1)
    assert parse_sales_date({"sales_period": "01/2025"}) == date(2025, 1, 1)
    assert parse_sales_date({"sales_period": "24/04/2026"}) == date(2026, 4, 24)
    assert parse_sales_date({"sales_year": 2026, "sales_month": 7, "sales_day": 22}) == date(
        2026, 7, 22
    )


def test_decimal_normalization() -> None:
    assert parse_decimal("1,234.50") == Decimal("1234.50")
    assert parse_decimal(None) == Decimal("0")


def test_oscn_index_retains_ambiguity_for_quarantine() -> None:
    records = [
        OscnRecord(item_code="I1", card_code="CTW-1", customer_sku="SKU", partner_barcode=""),
        OscnRecord(item_code="I2", card_code="CTW-2", customer_sku="SKU", partner_barcode=""),
        OscnRecord(item_code="I3", card_code="CHP-1", customer_sku="SKU", partner_barcode=""),
    ]
    assert build_oscn_index(records, "CTW") == {"SKU": ("I1", "I2")}


def test_reconciliation_includes_quarantine_totals() -> None:
    summary = StagingSummary(
        source_code="DH",
        source_rows=2,
        filtered_rows=2,
        staged_rows=1,
        quarantined_rows=1,
        source_qty=Decimal("3"),
        staged_qty=Decimal("1"),
        quarantined_qty=Decimal("2"),
        source_amount=Decimal("300"),
        staged_amount=Decimal("100"),
        quarantined_amount=Decimal("200"),
    )
    assert summary.reconciles
