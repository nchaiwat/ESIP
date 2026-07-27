# Enterprise Sales Intelligence Platform (ESIP)

Workspace กลางสำหรับนำเข้าข้อมูลยอดขายและสินค้าคงคลังรายวันจาก Modern Trade ให้เป็นข้อมูลมาตรฐานสำหรับ Dashboard, KPI และ AI Analytics

## Current status

- Project phase: Sprint M1 - Daily raw onboarding and PostgreSQL migration
- Guidebook: v0.2
- Sources registered: DH, GBH, HH, HP, MH, TWD
- SAP master sources: Item Master Data, OSCN, Business Partner Master Data
- Daily raw samples: placed for DH, GBH, HH, HP/MH, and TWD
- Legacy KPI-by-SKU workbooks: removed from the active workspace on 2026-07-23

ดูสถานะและงานถัดไปที่ [PROJECT_STATUS.md](PROJECT_STATUS.md) และข้อกำหนดระบบที่ [Guidebook/ESIP_Engineering_Guidebook_v0.2.md](Guidebook/ESIP_Engineering_Guidebook_v0.2.md)

## Workspace map

```text
Guidebook/       Living Guidebook สำหรับคนและ AI
SourceFiles/     Raw files แยกตาม Modern Trade (ห้ามแก้ไขต้นฉบับ)
MasterData/      SAP master exports
ImportProfiles/  Metadata-driven import profiles
src/esip/        Source code
database/        Schema, migrations, views
tests/           Unit/integration tests และ expected results
output/          Generated canonical outputs และ reports
docs/            Architecture, decisions, data dictionary
config/          Source registry และ environment templates
```

## Data contract

- Sales amounts are excluding VAT and after discount.
- Sales data represents sell-out.
- Returns arrive as separate records.
- Files are downloaded and imported daily.
- SAP Business One is the master for products, customer SKU mapping, and branches.
- Every canonical record must retain batch, source file, sheet, and source row lineage.

## Getting started

1. Create a virtual environment and install the project with development tools: `python -m venv .venv` then `.venv\Scripts\python -m pip install -e ".[dev]"`.
2. Run `.venv\Scripts\esip status` to verify the manifest and import-profile structure.
3. Copy daily raw files into the matching `SourceFiles/<SOURCE>/incoming` folder.
4. Copy SAP exports into the matching `MasterData` folder.
5. Do not rename or edit raw files after placement.
6. Import profiles will normalize each source into canonical sales and inventory datasets.
7. Keep source and master files only in their governed folders; do not keep duplicate input files at the project root.

Validation commands:

- `.venv\Scripts\esip verify-manifest`
- `.venv\Scripts\esip validate-profiles`
- `.venv\Scripts\esip validate-master-data`
- `.venv\Scripts\esip postgres-load-gbh` (loads all dated GBH partitions)
- `.venv\Scripts\esip postgres-load-dh` (loads all dated DH sales and inventory files)
- `.venv\Scripts\esip postgres-load-twd` (loads all TWD files not already present)
- `.venv\Scripts\esip approval-check` (validates reviewed mapping decisions without changing data)
- `.venv\Scripts\esip publication-check` (validates publication approvals against live gates)
- `.venv\Scripts\python -m pytest`

For normal daily use, double-click `ESIP_Menu.cmd`. The menu exposes safe daily
operations only: refresh, open the latest result, validate mapping decisions, check
publication readiness, and check OSCN changes. Apply/approval controls remain separate
to prevent accidental changes.

For HH downloads, select `Prepare Today's HH Download Folder` from the menu before
downloading. Save the website files as `SaleReport.xlsx` and `StockReport.xlsx` inside
the opened `YYYY-MM-DD` folder. This preserves history without requiring file renaming.

The system retains the latest 30 Preview archives and 90 Daily Run reports of each
format, preventing operational history from growing without limit.

Before any Mapping or Publication approval is applied, ESIP creates a timestamped
governance backup under `output/governance_backups`. Each backup includes SHA-256
evidence, prior governed files, and the relevant pre-change database rows.

Parquet support is optional during the foundation phase. Install it with `.[parquet]` on a Python version supported by the pinned PyArrow range.

Review reports are written under `output/reports`. Candidate branch matches are advisory only; SAP CardCode mappings require approval before use.

Legacy KPI-by-SKU and provisional SQLite commands have been removed from the ESIP
command line. The supported production path is Daily Raw to PostgreSQL only.

Current user-facing preview:

- `output/reports/ESIP_Daily_Raw_Preview.xlsx` — PostgreSQL-backed operational and business preview.
  It is labeled `RECONCILED / NOT PUBLISHED` until mapping and publication approvals are complete.

Mapping approvals are handled from the `Product Mapping`, `Branch Approval`, and
`Approval Instructions` worksheets:

The Preview places exact-barcode and unique cross-source OSCN product evidence first,
followed by the remaining governed queue. High-confidence branch candidates are also
placed first. This changes only the review order; the original priority rank and
approval controls remain intact. The `Mapping Action Plan` sheet displays the latest
Candidate Quality gate result and issue count.

```powershell
esip approval-check --workbook output/reports/ESIP_Daily_Raw_Preview.xlsx
esip apply-approvals --workbook output/reports/ESIP_Daily_Raw_Preview.xlsx
```

The check command never changes files. Applying a fully valid review updates the
governed branch crosswalk. Product approvals become
`output/operations/oscn_change_requests.csv` requests for the SAP administrator;
the system never edits SAP Master Data directly.

### One-click Daily Run

Double-click `Run_ESIP_Daily.cmd` after placing new Daily Raw files in the governed
source folders. The run will:

1. refresh and verify the input manifest;
2. check PostgreSQL and synchronize all governed reference masters;
3. load every supported MT source, safely skipping existing batches;
4. refresh the Product and Branch work queues;
5. validate that evidence-backed Mapping candidates are unique and conflict-free;
6. archive the previous Preview before replacing it with a verified new Preview; and
7. write a readable result to `output/daily_runs/latest_run.md`.

The Daily Run does not approve mappings and does not publish data. Previous Preview
files are retained under `output/reports/archive`.

Unchanged batches are detected before ZIP/XLS/XLSX parsing. Reference masters are
also skipped only when source-file SHA-256 values, expected row counts, and PostgreSQL
content fingerprints all match `config/reference_sync_state.json`. If any file or
database content changes, a full reference sync runs automatically.

The reference-master step synchronizes the source registry, Item Master, Branch Master,
and approved Branch Crosswalk to PostgreSQL. It also checks the governed OSCN hash.
When OSCN changes, historical non-published batches are backed up and rebuilt from the
original Daily Raw files. Source reconciliation totals must remain identical and
`PRODUCT_NOT_MAPPED` quarantine may not increase; otherwise the previous database state
is restored automatically. The last successful OSCN revision is stored in
`config/oscn_reprocess_state.json`.

`Reprocess_After_OSCN_Change.cmd` can be used for an explicit OSCN check outside the
Daily Run. It does not rebuild anything when the OSCN hash is unchanged and it refuses
to rebuild published batches.

### One-click approval controls

- Double-click `Check_ESIP_Approvals.cmd` to validate the current Preview. It never
  changes mapping files.
- Double-click `Apply_ESIP_Approvals.cmd` only after the check passes. It asks for
  confirmation before applying APPROVED rows.

Each successful application retains an exact workbook copy under `output/approvals`
and appends a SHA-256-backed record to
`output/operations/approval_audit_log.csv`. Duplicate or conflicting approved rows
stop the whole application before any governed output is changed.

The mapping queues include `priority_rank`, row impact, cumulative impact, and
P1-P4 tiers. `Mapping Action Plan` summarizes the workload:

- P1 covers the first 50% of affected rows;
- P2 extends cumulative coverage to 80%;
- P3 extends cumulative coverage to 95%; and
- P4 contains the remaining low-impact tail.

These tiers prioritize review only; they never approve a mapping.

### Publication readiness

The `Publication Readiness` worksheet evaluates every batch against live PostgreSQL
state. A batch remains `BLOCKED` when reconciliation fails, its Daily Raw profile is
not validated, any quarantine rows remain, or its Branch Crosswalk coverage is
incomplete.

- Double-click `Check_Publication_Readiness.cmd` to validate any `APPROVED` choices
  without changing the database.
- Double-click `Apply_Publication_Approvals.cmd` to apply governance approval only
  after every live gate passes and an approval reference is supplied.

Applying publication approval does **not** publish facts. Publishing remains a
separate controlled transition. The current queue has 0 ready and 83 blocked batches,
so no governance approval or publication has been performed.

For repeated HH downloads, prefer `SaleReport_YYYYMMDD.xlsx` and
`StockReport_YYYYMMDD.xlsx`. Dated subfolders are also supported.

TA is Thai Aus and uses the exact SAP CardCode `COT-0165`. Its loader remains
disabled until Daily Raw structure and measure semantics are confirmed.

Operational database views:

- `vw_batch_health`
- `vw_dataset_coverage`
- `vw_quarantine_operations`

Published-only analytical views:

- `vw_published_sales`
- `vw_published_inventory`
- `vw_daily_sales_kpi`
- `vw_inventory_position`
- `vw_star_sales`
- `vw_star_inventory`
- `vw_semantic_daily_sales`
- `vw_semantic_inventory_snapshot`

Data-quality views:

- `vw_product_master_completeness`
- `vw_branch_crosswalk_coverage`

Operational CSV exports are written under `output/operations`.

Approved branch mappings are versioned in `config/branch_crosswalk.csv`. Rows are loaded only when `mapping_status` is `APPROVED` and `approval_reference` is populated.

Machine-readable readiness evidence and prioritized remediation queues are written under `output/readiness`.

Technical acceptance and business readiness are separate gates. The technical suite can pass while business readiness remains open for missing source files or approvals.

The current production direction is Daily Raw to PostgreSQL. See `PROJECT_STATUS.md` for source-specific loader readiness and remaining approval gates.
