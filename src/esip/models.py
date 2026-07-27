from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RecordType(StrEnum):
    SALE = "SALE"
    RETURN = "RETURN"


class BatchStatus(StrEnum):
    RECEIVED = "RECEIVED"
    VALIDATED = "VALIDATED"
    QUARANTINED = "QUARANTINED"
    RECONCILED = "RECONCILED"
    PUBLISHED = "PUBLISHED"


class ImportBatch(BaseModel):
    import_batch_id: str
    source_code: str
    source_file_name: str
    source_file_sha256: str
    imported_at_utc: datetime
    status: BatchStatus = BatchStatus.RECEIVED

    @field_validator("source_file_sha256")
    @classmethod
    def validate_sha256(cls, value: str) -> str:
        normalized = value.upper()
        if len(normalized) != 64 or any(ch not in "0123456789ABCDEF" for ch in normalized):
            raise ValueError("source_file_sha256 must contain 64 hexadecimal characters")
        return normalized


class Lineage(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    import_batch_id: str
    source_file_name: str
    source_sheet_name: str | None = None
    source_row_no: int | None = Field(default=None, ge=1)


class CanonicalSalesRecord(Lineage):
    source_code: str
    sales_date: date
    branch_source_code: str
    branch_source_name: str | None = None
    product_source_code: str
    sap_item_code: str | None = None
    sales_qty: Decimal
    sales_amount_ex_vat_after_discount: Decimal
    record_type: RecordType = RecordType.SALE


class CanonicalInventoryRecord(Lineage):
    source_code: str
    snapshot_date: date
    branch_source_code: str
    branch_source_name: str | None = None
    product_source_code: str
    sap_item_code: str | None = None
    onhand_qty: Decimal | None = None
    onhand_value: Decimal | None = None


class QuarantineRecord(Lineage):
    source_code: str
    dataset: str
    reason_code: str
    reason_detail: str
    source_payload: dict[str, Any]
