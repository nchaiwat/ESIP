CREATE TABLE IF NOT EXISTS import_batch (
    import_batch_id TEXT PRIMARY KEY,
    source_code TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_file_sha256 TEXT NOT NULL,
    imported_at_utc TEXT NOT NULL,
    status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_sales (
    sales_id INTEGER PRIMARY KEY,
    source_code TEXT NOT NULL,
    sales_date TEXT NOT NULL,
    branch_source_code TEXT NOT NULL,
    branch_source_name TEXT,
    product_source_code TEXT NOT NULL,
    sap_item_code TEXT,
    sales_qty NUMERIC NOT NULL,
    sales_amount_ex_vat_after_discount NUMERIC NOT NULL,
    record_type TEXT NOT NULL,
    import_batch_id TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_sheet_name TEXT,
    source_row_no INTEGER,
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id)
);

CREATE TABLE IF NOT EXISTS fact_inventory_snapshot (
    inventory_snapshot_id INTEGER PRIMARY KEY,
    source_code TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    branch_source_code TEXT NOT NULL,
    branch_source_name TEXT,
    product_source_code TEXT NOT NULL,
    sap_item_code TEXT,
    onhand_qty NUMERIC,
    onhand_value NUMERIC,
    import_batch_id TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_sheet_name TEXT,
    source_row_no INTEGER,
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id)
);

CREATE TABLE IF NOT EXISTS quarantine_record (
    quarantine_id INTEGER PRIMARY KEY,
    source_code TEXT NOT NULL,
    dataset TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    reason_detail TEXT NOT NULL,
    source_payload_json TEXT NOT NULL,
    import_batch_id TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_sheet_name TEXT,
    source_row_no INTEGER,
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_import_batch_source_file_hash
    ON import_batch(source_code, source_file_sha256);

CREATE TABLE IF NOT EXISTS batch_reconciliation (
    reconciliation_id INTEGER PRIMARY KEY,
    import_batch_id TEXT NOT NULL,
    dataset TEXT NOT NULL,
    source_rows INTEGER NOT NULL,
    staged_rows INTEGER NOT NULL,
    quarantined_rows INTEGER NOT NULL,
    source_measure NUMERIC NOT NULL,
    staged_measure NUMERIC NOT NULL,
    quarantined_measure NUMERIC NOT NULL,
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    UNIQUE(import_batch_id, dataset),
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id)
);

CREATE TABLE IF NOT EXISTS batch_governance (
    import_batch_id TEXT PRIMARY KEY,
    input_classification TEXT NOT NULL,
    profile_status TEXT NOT NULL,
    branch_mapping_status TEXT NOT NULL,
    approval_reference TEXT,
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id)
);

CREATE TABLE IF NOT EXISTS dim_source (
    source_code TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    sap_cardcode_prefix TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS dim_product (
    sap_item_code TEXT PRIMARY KEY,
    item_name TEXT,
    barcode TEXT,
    active TEXT,
    master_record_status TEXT NOT NULL,
    source_file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_branch (
    sap_card_code TEXT PRIMARY KEY,
    branch_name TEXT NOT NULL,
    sap_cardcode_prefix TEXT NOT NULL,
    source_file_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_calendar (
    calendar_date TEXT PRIMARY KEY,
    calendar_year INTEGER NOT NULL,
    calendar_quarter INTEGER NOT NULL,
    calendar_month INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    iso_week INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bridge_source_branch (
    source_code TEXT NOT NULL,
    branch_source_code TEXT NOT NULL DEFAULT '',
    branch_source_name TEXT NOT NULL DEFAULT '',
    sap_card_code TEXT NOT NULL,
    mapping_status TEXT NOT NULL,
    approval_reference TEXT NOT NULL,
    PRIMARY KEY (source_code, branch_source_code, branch_source_name),
    FOREIGN KEY (source_code) REFERENCES dim_source(source_code),
    FOREIGN KEY (sap_card_code) REFERENCES dim_branch(sap_card_code)
);

CREATE TABLE IF NOT EXISTS semantic_measure_catalog (
    measure_code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    dataset TEXT NOT NULL,
    aggregation TEXT NOT NULL,
    definition TEXT NOT NULL,
    certification_status TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS vw_batch_health AS
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
    COALESCE(MIN(r.passed), 0) AS all_reconciliations_passed,
    (SELECT COUNT(*) FROM fact_sales s WHERE s.import_batch_id = b.import_batch_id)
        AS sales_fact_rows,
    (SELECT COUNT(*) FROM fact_inventory_snapshot i
        WHERE i.import_batch_id = b.import_batch_id) AS inventory_fact_rows,
    (SELECT COUNT(*) FROM quarantine_record q WHERE q.import_batch_id = b.import_batch_id)
        AS quarantine_rows,
    CASE
        WHEN b.status = 'RECONCILED'
         AND COALESCE(MIN(r.passed), 0) = 1
         AND g.input_classification = 'DAILY_RAW'
         AND g.profile_status = 'APPROVED'
         AND g.branch_mapping_status = 'APPROVED'
         AND g.approval_reference IS NOT NULL
        THEN 1 ELSE 0
    END AS publish_eligible
FROM import_batch b
LEFT JOIN batch_reconciliation r ON r.import_batch_id = b.import_batch_id
LEFT JOIN batch_governance g ON g.import_batch_id = b.import_batch_id
GROUP BY b.import_batch_id;

CREATE VIEW IF NOT EXISTS vw_dataset_coverage AS
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
         ELSE CAST(staged_rows AS REAL) / (staged_rows + quarantined_rows)
    END AS staged_rate
FROM coverage;

CREATE VIEW IF NOT EXISTS vw_quarantine_operations AS
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

CREATE VIEW IF NOT EXISTS vw_published_sales AS
SELECT s.*
FROM fact_sales s
JOIN import_batch b ON b.import_batch_id = s.import_batch_id
WHERE b.status = 'PUBLISHED';

CREATE VIEW IF NOT EXISTS vw_published_inventory AS
SELECT i.*
FROM fact_inventory_snapshot i
JOIN import_batch b ON b.import_batch_id = i.import_batch_id
WHERE b.status = 'PUBLISHED';

CREATE VIEW IF NOT EXISTS vw_daily_sales_kpi AS
SELECT
    source_code,
    sales_date,
    record_type,
    COUNT(*) AS canonical_row_count,
    COUNT(DISTINCT branch_source_code) AS branch_count,
    COUNT(DISTINCT sap_item_code) AS sap_item_count,
    SUM(sales_qty) AS sales_qty,
    SUM(sales_amount_ex_vat_after_discount) AS sales_amount_ex_vat_after_discount
FROM vw_published_sales
GROUP BY source_code, sales_date, record_type;

CREATE VIEW IF NOT EXISTS vw_inventory_position AS
SELECT
    source_code,
    snapshot_date,
    COUNT(*) AS canonical_row_count,
    COUNT(DISTINCT branch_source_code) AS branch_count,
    COUNT(DISTINCT sap_item_code) AS sap_item_count,
    SUM(onhand_qty) AS onhand_qty,
    SUM(onhand_value) AS onhand_value
FROM vw_published_inventory
GROUP BY source_code, snapshot_date;

CREATE VIEW IF NOT EXISTS vw_star_sales AS
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

CREATE VIEW IF NOT EXISTS vw_star_inventory AS
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

CREATE VIEW IF NOT EXISTS vw_product_master_completeness AS
WITH facts AS (
    SELECT source_code, 'sales' AS dataset, sap_item_code FROM fact_sales
    UNION ALL
    SELECT source_code, 'inventory' AS dataset, sap_item_code FROM fact_inventory_snapshot
)
SELECT
    f.source_code,
    f.dataset,
    COUNT(*) AS canonical_rows,
    SUM(CASE WHEN p.master_record_status = 'ITEM_MASTER' THEN 1 ELSE 0 END)
        AS item_master_rows,
    SUM(CASE WHEN p.master_record_status = 'OSCN_ONLY' THEN 1 ELSE 0 END)
        AS oscn_only_rows,
    SUM(CASE WHEN p.sap_item_code IS NULL THEN 1 ELSE 0 END) AS unresolved_dimension_rows,
    CASE WHEN COUNT(*) = 0 THEN 0.0 ELSE
        CAST(SUM(CASE WHEN p.master_record_status = 'ITEM_MASTER' THEN 1 ELSE 0 END) AS REAL)
        / COUNT(*) END AS item_master_completeness_rate
FROM facts f
LEFT JOIN dim_product p ON p.sap_item_code = f.sap_item_code
GROUP BY f.source_code, f.dataset;

CREATE VIEW IF NOT EXISTS vw_branch_crosswalk_coverage AS
WITH identities AS (
    SELECT DISTINCT
        source_code,
        branch_source_code,
        COALESCE(branch_source_name, '') AS branch_source_name
    FROM fact_sales
    UNION
    SELECT DISTINCT
        source_code,
        branch_source_code,
        COALESCE(branch_source_name, '') AS branch_source_name
    FROM fact_inventory_snapshot
)
SELECT
    i.source_code,
    COUNT(*) AS source_branch_identities,
    SUM(CASE WHEN b.mapping_status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_mappings,
    COUNT(*) - SUM(CASE WHEN b.mapping_status = 'APPROVED' THEN 1 ELSE 0 END)
        AS pending_mappings,
    CASE WHEN COUNT(*) = 0 THEN 0.0 ELSE
        CAST(SUM(CASE WHEN b.mapping_status = 'APPROVED' THEN 1 ELSE 0 END) AS REAL)
        / COUNT(*) END AS approved_mapping_rate
FROM identities i
LEFT JOIN bridge_source_branch b
    ON b.source_code = i.source_code
   AND b.branch_source_code = i.branch_source_code
   AND b.branch_source_name = i.branch_source_name
GROUP BY i.source_code;

CREATE VIEW IF NOT EXISTS vw_semantic_daily_sales AS
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

CREATE VIEW IF NOT EXISTS vw_semantic_inventory_snapshot AS
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
