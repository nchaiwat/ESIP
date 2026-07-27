BEGIN;

CREATE TABLE IF NOT EXISTS import_batch (
    import_batch_id TEXT PRIMARY KEY,
    source_code TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_file_sha256 CHAR(64) NOT NULL,
    imported_at_utc TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    CONSTRAINT ck_import_batch_status
        CHECK (status IN ('RECEIVED', 'VALIDATED', 'QUARANTINED', 'RECONCILED', 'PUBLISHED')),
    CONSTRAINT ux_import_batch_source_hash UNIQUE (source_code, source_file_sha256)
);

CREATE TABLE IF NOT EXISTS fact_sales (
    sales_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_code TEXT NOT NULL,
    sales_date DATE NOT NULL,
    branch_source_code TEXT NOT NULL,
    branch_source_name TEXT,
    product_source_code TEXT NOT NULL,
    sap_item_code TEXT,
    sales_qty NUMERIC(24, 6) NOT NULL,
    sales_amount_ex_vat_after_discount NUMERIC(24, 6) NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN ('SALE', 'RETURN')),
    import_batch_id TEXT NOT NULL REFERENCES import_batch(import_batch_id),
    source_file_name TEXT NOT NULL,
    source_sheet_name TEXT,
    source_row_no INTEGER CHECK (source_row_no IS NULL OR source_row_no >= 1)
);

CREATE TABLE IF NOT EXISTS fact_inventory_snapshot (
    inventory_snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_code TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    branch_source_code TEXT NOT NULL,
    branch_source_name TEXT,
    product_source_code TEXT NOT NULL,
    sap_item_code TEXT,
    onhand_qty NUMERIC(24, 6),
    onhand_value NUMERIC(24, 6),
    import_batch_id TEXT NOT NULL REFERENCES import_batch(import_batch_id),
    source_file_name TEXT NOT NULL,
    source_sheet_name TEXT,
    source_row_no INTEGER CHECK (source_row_no IS NULL OR source_row_no >= 1)
);

CREATE TABLE IF NOT EXISTS quarantine_record (
    quarantine_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_code TEXT NOT NULL,
    dataset TEXT NOT NULL CHECK (dataset IN ('sales', 'inventory')),
    reason_code TEXT NOT NULL,
    reason_detail TEXT NOT NULL,
    source_payload_json JSONB NOT NULL,
    import_batch_id TEXT NOT NULL REFERENCES import_batch(import_batch_id),
    source_file_name TEXT NOT NULL,
    source_sheet_name TEXT,
    source_row_no INTEGER CHECK (source_row_no IS NULL OR source_row_no >= 1)
);

CREATE TABLE IF NOT EXISTS batch_reconciliation (
    reconciliation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_batch_id TEXT NOT NULL REFERENCES import_batch(import_batch_id),
    dataset TEXT NOT NULL CHECK (dataset IN ('sales', 'inventory')),
    source_rows INTEGER NOT NULL,
    staged_rows INTEGER NOT NULL,
    quarantined_rows INTEGER NOT NULL,
    source_measure NUMERIC(30, 8) NOT NULL,
    staged_measure NUMERIC(30, 8) NOT NULL,
    quarantined_measure NUMERIC(30, 8) NOT NULL,
    passed BOOLEAN NOT NULL,
    CONSTRAINT ux_batch_reconciliation_dataset UNIQUE (import_batch_id, dataset)
);

CREATE TABLE IF NOT EXISTS batch_governance (
    import_batch_id TEXT PRIMARY KEY REFERENCES import_batch(import_batch_id),
    input_classification TEXT NOT NULL,
    profile_status TEXT NOT NULL,
    branch_mapping_status TEXT NOT NULL,
    approval_reference TEXT
);

CREATE TABLE IF NOT EXISTS dim_source (
    source_code TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    sap_cardcode_prefix TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dim_product (
    sap_item_code TEXT PRIMARY KEY,
    item_name TEXT,
    barcode TEXT,
    active TEXT,
    master_record_status TEXT NOT NULL,
    product_family TEXT,
    source_file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_branch (
    sap_card_code TEXT PRIMARY KEY,
    branch_name TEXT NOT NULL,
    sap_cardcode_prefix TEXT NOT NULL,
    source_file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_calendar (
    calendar_date DATE PRIMARY KEY,
    calendar_year INTEGER NOT NULL,
    calendar_quarter INTEGER NOT NULL CHECK (calendar_quarter BETWEEN 1 AND 4),
    calendar_month INTEGER NOT NULL CHECK (calendar_month BETWEEN 1 AND 12),
    month_name TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    iso_week INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7)
);

CREATE TABLE IF NOT EXISTS bridge_source_branch (
    source_code TEXT NOT NULL REFERENCES dim_source(source_code),
    branch_source_code TEXT NOT NULL DEFAULT '',
    branch_source_name TEXT NOT NULL DEFAULT '',
    sap_card_code TEXT NOT NULL REFERENCES dim_branch(sap_card_code),
    mapping_status TEXT NOT NULL,
    mapping_method TEXT NOT NULL DEFAULT 'ADMIN_APPROVED',
    confidence_score NUMERIC(6, 5),
    approval_reference TEXT NOT NULL,
    PRIMARY KEY (source_code, branch_source_code, branch_source_name)
);

CREATE TABLE IF NOT EXISTS semantic_measure_catalog (
    measure_code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    dataset TEXT NOT NULL,
    aggregation TEXT NOT NULL,
    definition TEXT NOT NULL,
    certification_status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_fact_sales_date ON fact_sales (sales_date);
CREATE INDEX IF NOT EXISTS ix_fact_sales_source_item ON fact_sales (source_code, sap_item_code);
CREATE INDEX IF NOT EXISTS ix_inventory_snapshot_date
    ON fact_inventory_snapshot (snapshot_date);
CREATE INDEX IF NOT EXISTS ix_inventory_source_item
    ON fact_inventory_snapshot (source_code, sap_item_code);
CREATE INDEX IF NOT EXISTS ix_quarantine_batch_reason
    ON quarantine_record (import_batch_id, dataset, reason_code);

CREATE OR REPLACE VIEW vw_published_sales AS
SELECT s.*
FROM fact_sales s
JOIN import_batch b ON b.import_batch_id = s.import_batch_id
WHERE b.status = 'PUBLISHED';

CREATE OR REPLACE VIEW vw_published_inventory AS
SELECT i.*
FROM fact_inventory_snapshot i
JOIN import_batch b ON b.import_batch_id = i.import_batch_id
WHERE b.status = 'PUBLISHED';

CREATE OR REPLACE VIEW vw_batch_health AS
SELECT
    b.import_batch_id,
    b.source_code,
    b.source_file_name,
    b.status,
    g.input_classification,
    g.profile_status,
    g.branch_mapping_status,
    g.approval_reference,
    COUNT(DISTINCT r.dataset) AS reconciled_dataset_count,
    COALESCE(BOOL_AND(r.passed), FALSE) AS all_reconciliations_passed,
    (SELECT COUNT(*) FROM fact_sales s WHERE s.import_batch_id = b.import_batch_id)
        AS sales_fact_rows,
    (SELECT COUNT(*) FROM fact_inventory_snapshot i
        WHERE i.import_batch_id = b.import_batch_id) AS inventory_fact_rows,
    (SELECT COUNT(*) FROM quarantine_record q WHERE q.import_batch_id = b.import_batch_id)
        AS quarantine_rows,
    CASE
        WHEN b.status = 'RECONCILED'
         AND COALESCE(BOOL_AND(r.passed), FALSE)
         AND g.input_classification = 'DAILY_RAW'
         AND g.profile_status = 'APPROVED'
         AND g.branch_mapping_status = 'APPROVED'
         AND g.approval_reference IS NOT NULL
        THEN TRUE ELSE FALSE
    END AS publish_eligible
FROM import_batch b
LEFT JOIN batch_reconciliation r ON r.import_batch_id = b.import_batch_id
LEFT JOIN batch_governance g ON g.import_batch_id = b.import_batch_id
GROUP BY b.import_batch_id, g.import_batch_id;

CREATE OR REPLACE VIEW vw_dataset_coverage AS
WITH datasets AS (
    SELECT b.import_batch_id, b.source_code, r.dataset
    FROM import_batch b
    JOIN batch_reconciliation r ON r.import_batch_id = b.import_batch_id
), coverage AS (
    SELECT
        d.source_code,
        d.dataset,
        CASE d.dataset
            WHEN 'sales' THEN (SELECT COUNT(*) FROM fact_sales f
                WHERE f.import_batch_id = d.import_batch_id)
            WHEN 'inventory' THEN (SELECT COUNT(*) FROM fact_inventory_snapshot f
                WHERE f.import_batch_id = d.import_batch_id)
        END AS staged_rows,
        (SELECT COUNT(*) FROM quarantine_record q
            WHERE q.import_batch_id = d.import_batch_id AND q.dataset = d.dataset)
            AS quarantined_rows
    FROM datasets d
)
SELECT
    source_code,
    dataset,
    staged_rows,
    quarantined_rows,
    staged_rows + quarantined_rows AS total_rows,
    CASE WHEN staged_rows + quarantined_rows = 0 THEN 0.0
         ELSE staged_rows::DOUBLE PRECISION / (staged_rows + quarantined_rows)
    END AS staged_rate
FROM coverage;

CREATE OR REPLACE VIEW vw_quarantine_operations AS
SELECT
    b.source_code,
    q.dataset,
    q.reason_code,
    COUNT(*) AS affected_rows,
    MIN(q.source_row_no) AS first_source_row,
    MAX(q.source_row_no) AS last_source_row
FROM quarantine_record q
JOIN import_batch b ON b.import_batch_id = q.import_batch_id
GROUP BY b.source_code, q.dataset, q.reason_code;

CREATE OR REPLACE VIEW vw_star_sales AS
SELECT
    s.sales_id,
    s.sales_date,
    c.calendar_year,
    c.calendar_quarter,
    c.calendar_month,
    c.month_name,
    s.source_code,
    ds.source_name,
    s.branch_source_code,
    s.branch_source_name,
    bs.sap_card_code,
    db.branch_name AS sap_branch_name,
    CASE WHEN bs.sap_card_code IS NULL THEN 'UNMAPPED' ELSE bs.mapping_status END
        AS branch_mapping_status,
    s.product_source_code,
    s.sap_item_code,
    dp.item_name AS sap_item_name,
    dp.product_family,
    dp.master_record_status AS product_master_status,
    s.sales_qty,
    s.sales_amount_ex_vat_after_discount,
    s.record_type,
    s.import_batch_id
FROM vw_published_sales s
LEFT JOIN dim_calendar c ON c.calendar_date = s.sales_date
LEFT JOIN dim_source ds ON ds.source_code = s.source_code
LEFT JOIN bridge_source_branch bs
    ON bs.source_code = s.source_code
   AND bs.branch_source_code = s.branch_source_code
   AND bs.branch_source_name = COALESCE(s.branch_source_name, '')
LEFT JOIN dim_branch db ON db.sap_card_code = bs.sap_card_code
LEFT JOIN dim_product dp ON dp.sap_item_code = s.sap_item_code;

CREATE OR REPLACE VIEW vw_star_inventory AS
SELECT
    i.inventory_snapshot_id,
    i.snapshot_date,
    c.calendar_year,
    c.calendar_quarter,
    c.calendar_month,
    c.month_name,
    i.source_code,
    ds.source_name,
    i.branch_source_code,
    i.branch_source_name,
    bs.sap_card_code,
    db.branch_name AS sap_branch_name,
    CASE WHEN bs.sap_card_code IS NULL THEN 'UNMAPPED' ELSE bs.mapping_status END
        AS branch_mapping_status,
    i.product_source_code,
    i.sap_item_code,
    dp.item_name AS sap_item_name,
    dp.product_family,
    dp.master_record_status AS product_master_status,
    i.onhand_qty,
    i.onhand_value,
    i.import_batch_id
FROM vw_published_inventory i
LEFT JOIN dim_calendar c ON c.calendar_date = i.snapshot_date
LEFT JOIN dim_source ds ON ds.source_code = i.source_code
LEFT JOIN bridge_source_branch bs
    ON bs.source_code = i.source_code
   AND bs.branch_source_code = i.branch_source_code
   AND bs.branch_source_name = COALESCE(i.branch_source_name, '')
LEFT JOIN dim_branch db ON db.sap_card_code = bs.sap_card_code
LEFT JOIN dim_product dp ON dp.sap_item_code = i.sap_item_code;

CREATE OR REPLACE VIEW vw_semantic_daily_sales AS
SELECT
    source_code,
    source_name,
    sales_date,
    calendar_year,
    calendar_quarter,
    calendar_month,
    month_name,
    SUM(CASE WHEN record_type = 'SALE' THEN sales_qty ELSE 0 END) AS sell_out_qty,
    SUM(CASE WHEN record_type = 'SALE'
        THEN sales_amount_ex_vat_after_discount ELSE 0 END)
        AS sell_out_sales_ex_vat_after_discount,
    ABS(SUM(CASE WHEN record_type = 'RETURN' THEN sales_qty ELSE 0 END)) AS return_qty,
    ABS(SUM(CASE WHEN record_type = 'RETURN'
        THEN sales_amount_ex_vat_after_discount ELSE 0 END)) AS return_amount,
    SUM(sales_qty) AS net_sales_qty,
    SUM(sales_amount_ex_vat_after_discount) AS net_sales_amount_ex_vat_after_discount,
    COUNT(DISTINCT sap_item_code) AS sap_item_count,
    COUNT(DISTINCT branch_source_code || '|' || COALESCE(branch_source_name, ''))
        AS source_branch_count
FROM vw_star_sales
GROUP BY
    source_code, source_name, sales_date, calendar_year, calendar_quarter,
    calendar_month, month_name;

CREATE OR REPLACE VIEW vw_semantic_inventory_snapshot AS
SELECT
    source_code,
    source_name,
    snapshot_date,
    calendar_year,
    calendar_quarter,
    calendar_month,
    month_name,
    SUM(onhand_qty) AS onhand_qty,
    SUM(onhand_value) AS onhand_value,
    COUNT(DISTINCT sap_item_code) AS sap_item_count,
    COUNT(DISTINCT branch_source_code || '|' || COALESCE(branch_source_name, ''))
        AS source_branch_count
FROM vw_star_inventory
GROUP BY
    source_code, source_name, snapshot_date, calendar_year, calendar_quarter,
    calendar_month, month_name;

COMMIT;
