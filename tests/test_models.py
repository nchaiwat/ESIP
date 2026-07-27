from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from esip.models import CanonicalSalesRecord, ImportBatch, RecordType


def test_sales_record_preserves_return_and_lineage() -> None:
    record = CanonicalSalesRecord(
        import_batch_id="batch-1",
        source_file_name="daily.xlsx",
        source_sheet_name="Returns",
        source_row_no=2,
        source_code="DH",
        sales_date=date(2026, 7, 22),
        branch_source_code="B01",
        product_source_code="SKU01",
        sales_qty=Decimal("-1"),
        sales_amount_ex_vat_after_discount=Decimal("-100"),
        record_type=RecordType.RETURN,
    )
    assert record.record_type is RecordType.RETURN
    assert record.source_row_no == 2


def test_lineage_row_number_must_be_positive() -> None:
    with pytest.raises(ValidationError):
        CanonicalSalesRecord(
            import_batch_id="batch-1",
            source_file_name="daily.xlsx",
            source_row_no=0,
            source_code="DH",
            sales_date=date(2026, 7, 22),
            branch_source_code="B01",
            product_source_code="SKU01",
            sales_qty=Decimal("1"),
            sales_amount_ex_vat_after_discount=Decimal("100"),
        )


def test_import_batch_rejects_invalid_hash() -> None:
    with pytest.raises(ValidationError):
        ImportBatch(
            import_batch_id="batch-1",
            source_code="DH",
            source_file_name="daily.xlsx",
            source_file_sha256="not-a-hash",
            imported_at_utc="2026-07-22T00:00:00Z",
        )
