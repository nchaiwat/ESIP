# Enterprise Sales Intelligence Platform (ESIP)

## Engineering Guidebook v0.2

Owner: Window Asia Public Company Limited  
Status: Living Document  
Updated: 22 July 2026

## 1. Purpose and vision

ESIP is the governed data platform for daily sell-out and inventory reporting from Modern Trade partners. It converts source files with incompatible layouts into one traceable canonical model for dashboards, KPI analysis, and future AI use.

The target outcome is a trusted daily view that can answer what happened, why it happened, and what action should follow without manually consolidating Excel files.

## 2. Confirmed business contract

- Sales amount excludes VAT.
- Sales amount is after discount.
- The transactions represent sell-out.
- Returns are delivered as separate records and must be preserved as a distinct record type.
- Files are downloaded and processed every day.
- SAP Business One is the master for product, customer-SKU mapping, and branch data.

## 3. Scope

Initial sources are DoHome (DH), Global House (GBH), HomeHub (HH), HomePro (HP), MegaHome (MH), and Thai Watsadu (TWD). The initial facts are sales and inventory snapshots. Forecasting, promotion ROI, and demand planning follow after the data foundation is proven.

## 4. Architecture

```text
Modern Trade daily files              SAP Business One exports
DH GBH HH HP MH TWD                   Item Master / OSCN / BP Master
           |                                      |
           +------------ Landing zone ------------+
                              |
                     Profile recognition
                              |
                Validation and transformation
                              |
                      SAP master mapping
                              |
                 Canonical sales and inventory
                              |
                 Warehouse / semantic data mart
                              |
                    Dashboard / KPI / AI
```

## 5. System constitution

1. SAP is the master; source files never create product or branch masters automatically.
2. Dashboards read canonical or warehouse data only.
3. Each file family has a versioned Import Profile.
4. Source-specific behavior belongs in configuration and reusable transforms, not business KPI logic.
5. Every output row retains source, batch, file, sheet, and row lineage.
6. Invalid and unmapped data is quarantined with a reason; it is never silently discarded.
7. Raw files are immutable and deduplicated by cryptographic hash.

## 6. Source registry

| Code | Partner | SAP prefix | Typical format | Daily content |
|---|---|---|---|---|
| DH | DoHome | CDH | XLSX | Sales, inventory |
| GBH | Global House | CGH | XLSX | Sales, inventory |
| HH | HomeHub | CHH | XLSX | Sales, inventory |
| HP | HomePro | CHP | ZIP/CSV | Sales, inventory |
| MH | MegaHome | CMH | ZIP/CSV | Sales, inventory |
| TWD | Thai Watsadu | CTW | XLS/XLSX | Sales, inventory |

## 7. Canonical outputs

`fact_sales` has the grain of source, sales date, branch, product, and record type. The measure is sell-out sales excluding VAT after discount. Returns stay separate.

`fact_inventory_snapshot` has the grain of source, snapshot date, branch, and product. Core measures are on-hand quantity and value; optional source metrics remain extension fields until their definitions are approved.

Both facts carry SAP ItemCode when mapping succeeds and full source lineage regardless of mapping status.

## 8. Import workflow

1. Land the original file in the source `incoming` folder.
2. Compute hash and reject duplicate file submissions.
3. Recognize source and report type using filename, archive content, sheet, and header signatures.
4. Read with the matching versioned Import Profile.
5. Normalize headers, dates, numbers, identifiers, and wide matrices.
6. Validate mandatory fields and source rules.
7. Map customer SKU through OSCN and branch through Business Partner Master Data.
8. Quarantine errors; load valid records into canonical staging.
9. Reconcile source totals against canonical totals.
10. Publish the batch only after reconciliation passes.

## 9. Milestones

| Milestone | Outcome | Acceptance gate |
|---|---|---|
| M0 Foundation | Workspace and Guidebook | Structure, registry, status, initial contracts exist |
| M1 Source onboarding | Real files profiled | All samples placed, hashed, mapped, and test fixtures recorded |
| M2 Import engine | Daily import repeatable | All sources import without code changes for routine daily files |
| M3 Canonical layer | Trusted sales/inventory | Mapping, quarantine, lineage, reconciliation pass |
| M4 Warehouse | Historical analytical model | Dimensions and facts support multi-dimensional drill-down |
| M5 Dashboard | Daily executive use | KPI ties to approved reconciliation and role access |
| M6 AI analytics | Governed insights | AI answers only from certified semantic data and cites lineage |

## 10. Current state and next action

The workspace foundation is complete. Daily Raw deliveries are stored only in governed source folders, and SAP Item Master, OSCN, and Branch Master exports are stored under `MasterData`. Legacy KPI-by-SKU workbooks and their generated provisional outputs were removed from the active workspace on 2026-07-23. TA remains deferred.

The immediate next action is to profile the placed workbooks and produce a SHA-256 source manifest, workbook structure inventory, field mapping matrix, and acceptance test per source. The earlier raw daily-report attachments are not separately visible in the current filesystem.

## 11. AI context

Purpose: Normalize daily Modern Trade sell-out and inventory into governed canonical facts.  
Master systems: SAP Item Master Data, OSCN, Business Partner Master Data.  
Sales semantics: ex-VAT, after discount, sell-out, returns separated.  
Active sources: DH, GBH, HH, HP, MH, TWD.  
Non-negotiables: immutable raw files, configuration-driven profiles, quarantine, reconciliation, end-to-end lineage, canonical-only analytics.  
Current constraint: KPI workbooks are available, but the earlier raw daily-report attachments are not separately visible.  
Next milestone: M1 Source onboarding baseline.
