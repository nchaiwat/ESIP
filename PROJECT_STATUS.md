# ESIP Project Status

Updated: 2026-07-23 (Asia/Bangkok)

## Overall status

Technical status: **PASS**

Business publication status: **BLOCKED - mapping remediation and approvals required**

Automated verification: **80 tests passed; static checks passed**

The active production direction is Daily Raw to PostgreSQL. Legacy KPI-by-SKU
workbooks, generated prototype databases, and duplicate source folders have been
removed from the active workflow.

## Governed inputs

- Workspace: `D:\Python\ESIP`
- Manifest: 78/78 verified inputs
- Daily Raw: 75 files
- SAP master files: 3
- Active Daily Raw sources: DH, GBH, HH, HP, MH, TWD
- Prepared source waiting for data: TA / Thai Aus
- TA exact SAP CardCode: `COT-0165`
- TA remains disabled until its first Daily Raw sales and inventory files are profiled

HH supports dated subfolders or the preferred `SaleReport_YYYYMMDD.xlsx` and
`StockReport_YYYYMMDD.xlsx` naming convention. HP and MH intentionally share the same
delivery files and are separated by source identity inside the data.

## Import profiles

DH, GBH, HH, HP, MH, and TWD use evidence-backed `validated_daily_raw` profiles
version 1.0. These profiles document the real file patterns, layouts, mappings,
date derivation, measure semantics, and successful reconciliation evidence.

TA uses a disabled `waiting_for_daily_raw` profile.

DH Daily Raw sales supplies quantity only. DH sales amount is retained as
zero/not supplied and is never inferred.

## PostgreSQL

- PostgreSQL: 17.10
- Base tables: 12
- Governed views: 9
- Governed sources synchronized: 7
- In-scope FA/FU products: 9,423
- SAP branches: 368
- Approved Branch Crosswalk rows: 0
- Import batches: 83
- Dataset reconciliations: 98/98 passed
- Total source rows: 1,212,951
- Loaded fact rows: 265,721
- Quarantined rows: 947,230
- Published batches: 0

Current mapping coverage:

| Source | Dataset | Source rows | Loaded | Quarantined | Rate |
|---|---:|---:|---:|---:|---:|
| DH | inventory | 158,282 | 34,200 | 124,082 | 21.6% |
| DH | sales | 240,483 | 36,993 | 203,490 | 15.4% |
| GBH | inventory | 300,222 | 16,744 | 283,478 | 5.6% |
| GBH | sales | 300,222 | 16,744 | 283,478 | 5.6% |
| HH | inventory | 7,900 | 4,000 | 3,900 | 50.6% |
| HH | sales | 7,900 | 4,000 | 3,900 | 50.6% |
| HP | inventory | 13,980 | 13,902 | 78 | 99.4% |
| HP | sales | 279 | 268 | 11 | 96.1% |
| MH | inventory | 8,511 | 5,670 | 2,841 | 66.6% |
| MH | sales | 198 | 134 | 64 | 67.7% |
| TWD | inventory | 87,487 | 66,533 | 20,954 | 76.0% |
| TWD | sales | 87,487 | 66,533 | 20,954 | 76.0% |

All quarantine rows remain traceable to source file, sheet/member, and row. No
unmapped product or branch is guessed.

## Mapping and approval governance

- Product remediation queue: 2,891 source product codes
- Branch approval queue: 677 source branch identities
- High-confidence branch candidates: 195
- Review-required branch identities: 482
- Product P1: 337 codes covering the first 50% of affected rows
- Product P2: 295 codes extending cumulative coverage to 80%
- Product P3: 226 codes extending cumulative coverage to 95%
- Product P4: 2,033 remaining codes
- Unique cross-source OSCN identifiers provide 31 MH product suggestions from HP
  evidence, covering 2,864 affected rows; all remain pending explicit approval
- Branch P1/P2/P3/P4 identities: 90 / 134 / 187 / 266
- Same-code branch-name enrichment contributes 53 high-confidence candidates
  covering 173,860 affected rows; each remains subject to explicit approval
- Product approval creates an OSCN change request; it never edits SAP directly
- Branch approval updates the governed Crosswalk only after CardCode validation
- Every application requires an approval reference and retains workbook-hash audit
- Every Mapping/Publication apply creates a pre-change governance backup with hashes
  under `output/governance_backups`
- Duplicate or conflicting approvals stop the complete application

Approved Branch Crosswalk rows are synchronized directly to PostgreSQL
`bridge_source_branch`; branch approval does not require fact reprocessing.

## OSCN revision and historical reprocessing

The current OSCN SHA-256 is tracked in `config/oscn_reprocess_state.json`.
When OSCN changes, non-published historical batches are backed up and rebuilt from
the original Daily Raw files.

A forced production-like verification successfully rebuilt all 83 batches and all
98 reconciliations while preserving 1,212,951 source rows and every source measure.
All reconciliations passed. `PRODUCT_NOT_MAPPED` remained 947,230 because the OSCN
content had not changed.

Published batches are never rebuilt automatically. Any failed comparison restores
the prior PostgreSQL state.

## Publication readiness

Publication readiness is calculated per batch from live evidence:

- batch status is `RECONCILED`;
- all dataset reconciliations pass;
- the source has a validated Daily Raw profile;
- quarantine count is zero; and
- every source branch identity has an approved Crosswalk mapping.

Current result: **0 ready / 83 blocked**.

Publication approval controls can update governance only after every gate passes.
They do not publish facts. No batch has been approved or published.

## User-facing outputs

- Current Preview: `output/reports/ESIP_Daily_Raw_Preview.xlsx`
- Input Freshness sheet: latest Sales/Inventory date and relative lag by MT,
  including TA waiting-for-first-data status
- Daily Action List sheet: prioritized input, mapping, and publication actions
  calculated from current PostgreSQL evidence
- Input File Safety sheet: dated-history and overwrite-risk checks for every
  Daily Raw incoming folder, plus SHA-256 duplicate-content detection
- Manual Report Coverage sheet: traceable comparison against the supplied manual
  Sale Out workbook and Current Dashboard reference
- Product Mapping and Branch Approval sheets: evidence-backed and high-confidence
  candidates are placed first for review while governed priority ranks remain unchanged
- Mapping Action Plan sheet: shows the current Candidate Quality gate result and
  reviewed product/branch candidate counts directly in the Preview
- Daily Run result: `output/daily_runs/latest_run.md`
- Prior Preview versions: `output/reports/archive`
- Reprocess evidence: `output/reprocess`
- Product/Branch/Publication queues: `output/operations`
- Mapping candidate integrity report:
  `output/operations/mapping_candidate_quality.json`

One-click controls:

- `ESIP_Menu.cmd` (recommended starting point; safe daily actions only)
- `Prepare_HH_Download_Folder.cmd` (creates and opens today's dated HH folder)
- `Open_ESIP_Result.cmd`
- `Run_ESIP_Daily.cmd`
- `Check_ESIP_Approvals.cmd`
- `Apply_ESIP_Approvals.cmd`
- `Check_Publication_Readiness.cmd`
- `Apply_Publication_Approvals.cmd`
- `Reprocess_After_OSCN_Change.cmd`

The optimized unchanged-input Daily Run completes in approximately 42.69 seconds on
the current machine, down from approximately 230 seconds. Existing batches are checked
before source-file parsing. Reference-master cache reuse requires matching input hashes,
dimension counts, and full PostgreSQL content fingerprints; otherwise the sync runs in full.

Every Daily Run now rejects the generated review queue before Preview creation if an
evidence-backed product has zero/multiple targets, or if a high-confidence branch has
a blank target, similarity below 0.95, or a conflicting target for the same source code.

## Remaining external/business actions

1. Review and approve Branch Mapping candidates.
2. Review Product Mapping and submit approved OSCN changes to the SAP administrator.
3. Replace the governed OSCN export after SAP changes; Daily Run will reprocess history.
4. Repeat remediation until quarantine is zero and Branch Crosswalk coverage is complete.
5. Review the Publication Readiness queue and supply approval references.
6. Provide TA Daily Raw sales and inventory files when available.
7. Restore the missing Git history from the original repository or remote; the copied
   `.git` directory is empty.

## Current risks

1. Source websites may change headers or layouts without notice.
2. OSCN keys may be missing or ambiguous.
3. Branch names may not uniquely identify a SAP CardCode.
4. TWD legacy `.xls` files emit sector-size warnings but currently parse and reconcile.
5. Publication must remain blocked until all live gates pass.
