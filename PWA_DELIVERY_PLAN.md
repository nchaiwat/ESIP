# ESIP PWA — Delivery Plan and Theme Assessment

Updated: 2026-07-24

## 1. Executive summary

ESIP ส่วน Data Pipeline หลักพร้อมใช้เป็น Backend data foundation แล้ว ส่วน PWA
ยังไม่ได้เริ่มสร้างเป็น Application จริง แต่ Theme จากไฟล์
`stitch_enterprise_sales_intelligence_platform.zip` สามารถใช้เป็น Visual Design
Foundation ได้

ข้อสรุป Theme:

- ใช้แนวทางสี ตัวอักษร Layout ตาราง Card Navigation และ Mobile Dashboard ได้
- มีต้นแบบ 19 หน้า พร้อม Screenshot 21 ภาพ และ Design System 1 ชุด
- มีหน้าที่ตรงกับความต้องการ Admin หลายส่วน เช่น Partner, SKU, User Access,
  System Settings, Onboarding, Batch Actions และ Risk Alerts
- ไม่สามารถนำ HTML ไป Deploy เป็น Production PWA ตรง ๆ
- ต้องแปลงเป็น Components, Routes และเชื่อม Backend/API จริง
- ต้องเพิ่ม PWA manifest, service worker, authentication, authorization,
  validation, audit, error/loading states และ responsive behavior

คำแนะนำ: ใช้ Theme เดิมเป็นทิศทางหลัก โดยเปลี่ยนชื่อและข้อมูลทั้งหมดให้เป็น ESIP
และลด Feature ที่ไม่เกี่ยวกับงานจริง เช่น Predictive/Risk/Onboarding บางส่วนออกจาก
MVP ก่อน

## 2. สิ่งที่ Deliver ได้แล้ว

### Data and processing

- Daily Raw ingestion สำหรับ DH, GBH, HH, HP, MH และ TWD
- TA/Thai Aus ถูกเตรียมไว้ด้วย exact SAP CardCode `COT-0165`
- PostgreSQL operational warehouse
- Source reconciliation และ quarantine
- Product Mapping work queue
- Branch Mapping approval queue
- Publication readiness queue
- Historical reprocess หลัง OSCN เปลี่ยน
- Input freshness และ duplicate-file safety
- Governance backup และ audit log

### User-facing operations

- `output/reports/ESIP_Daily_Raw_Preview.xlsx`
- Dashboard, Daily Action List, Rankings และ Daily Trend
- Product/Branch approval worksheets
- Manual Report Coverage
- Input Freshness และ Input File Safety
- Mapping Action Plan และ Candidate Quality gate
- One-click `ESIP_Menu.cmd`

### Current verified status

- Daily Run: PASS
- 80 automated tests: PASS
- Static checks: PASS
- 83 import batches
- 98 reconciliations: PASS
- 1,212,951 source rows
- 265,721 loaded facts
- 947,230 quarantined rows
- 33 reviewable Product candidates
- 195 high-confidence Branch candidates
- 0 ready / 83 blocked publication batches

## 3. Theme inventory

Theme มี Static HTML 19 หน้า:

1. Executive Mobile Dashboard
2. Partner Intelligence Detail
3. SKU Performance Detail
4. Admin Enterprise Dashboard
5. Partner Management List
6. SKU Inventory Management List
7. User Access and Permissions
8. System Settings
9. New Partner Onboarding — Profile
10. New Partner Onboarding — Regional Setup
11. New Partner Onboarding — Integration
12. New Partner Onboarding — Final Review
13. Onboarding Dashboard
14. Bulk Actions and Batch Management
15. Onboarding Throughput Analysis
16. Predictive Analytics
17. Risk Mitigation Dashboard
18. Risk Mitigation Detail
19. Risk Alert Escalation Configuration

Design direction:

- Dark enterprise theme
- Navy/charcoal surfaces
- Teal primary action and positive status
- Orange/coral warning and comparison data
- Inter for UI
- JetBrains Mono for SKU, currency and technical data
- High-density tables
- Desktop sidebar and Mobile bottom navigation

## 4. Theme readiness assessment

### Reusable

- Color tokens and surface hierarchy
- Typography scale
- Sidebar and mobile navigation concepts
- KPI cards
- Data tables and status pills
- Filter/search patterns
- Dashboard, Partner, SKU, User and Settings layouts
- Mobile executive dashboard
- Onboarding stepper concept

### Must be rebuilt

- HTML pages are standalone and duplicate their styles/configuration
- Navigation links do not implement real routes
- Buttons and forms are presentation-only
- Charts use mock/static presentation rather than real data components
- Data is sample content and does not follow ESIP contracts
- No shared component library
- No state management or API client
- No authentication or role enforcement
- No PWA manifest or service worker
- No offline/error/loading strategy
- No production build configuration

### Production risks to remove

- Tailwind is loaded from CDN at runtime
- Google Fonts and Material Symbols are loaded externally
- Profile photos/maps use externally hosted prototype assets
- Several pages are fixed desktop compositions; a separate mobile page exists,
  but the full Admin console has not been proven responsive
- Theme is English-first; Thai labels and Thai font fallback must be tested
- Accessibility, keyboard navigation and contrast need formal verification

Overall assessment:

**Suitable as a design reference and component blueprint; not suitable as a
drop-in production application.**

## 5. Proposed PWA structure

### User side

1. Executive Dashboard
   - Total Sales, Qty, Coverage and freshness
   - Daily/weekly/monthly trend
   - Top MT, Branch and SKU
   - Quarantine and publication status
2. Partner/MT Intelligence
   - DH, GBH, HH, HP, MH, TWD and TA
   - Latest input date and data health
   - Sales/stock trends and coverage
3. SKU Intelligence
   - SAP ItemCode and source SKU
   - Sales, stock, mapping coverage and source lineage
4. Alerts and Daily Actions
   - Stale input
   - HH overwrite risk
   - Mapping backlog
   - Reconciliation/publication blockers
5. Export
   - Excel/CSV export under role permission

### Admin side

1. Admin Dashboard
   - Pipeline status
   - Latest run
   - Failed/blocked batches
   - Mapping and publication workload
2. Source/MT Management
   - Enable/disable source
   - CardCode prefix/exact match
   - Expected report types and file naming
   - Freshness threshold
3. File and Batch Management
   - Upload/register Daily Raw
   - File hash and duplicate detection
   - Run history and reconciliation
   - Retry/reprocess under controlled workflow
4. Product Mapping
   - Candidate evidence
   - Approve/reject with approval reference
   - Generate OSCN change request
   - Never edit SAP directly
5. Branch Mapping
   - Candidate evidence and similarity
   - Approve/reject governed crosswalk
6. Publication Governance
   - Readiness gates
   - Approval reference
   - Approval does not automatically publish facts
7. Master Data
   - Item Master, OSCN and Branch Master version/status
   - Hash, row count and last synchronized timestamp
8. Users and Roles
   - User lifecycle
   - Role assignment
   - Session and access review
9. Audit and Backups
   - Who changed what and when
   - Approval history
   - Pre-change backup manifests
10. System Settings
    - Thresholds, retention and notifications
    - Safe settings only; secrets are not shown in UI

## 6. Roles and permissions

Recommended roles:

- `EXECUTIVE_VIEWER`
  - View dashboard and approved reports
- `DATA_ANALYST`
  - View operational detail and export allowed datasets
- `DATA_STEWARD`
  - Review Product/Branch candidates and prepare approval decisions
- `SAP_ADMIN_COORDINATOR`
  - Download/track OSCN change requests; cannot edit SAP through ESIP
- `PUBLICATION_APPROVER`
  - Approve governance status only when every gate passes
- `SYSTEM_ADMIN`
  - Manage sources, users, settings and controlled operations
- `AUDITOR`
  - Read-only access to audit, approvals, backups and lineage

High-risk operations require:

- explicit permission;
- approval reference;
- pre-change backup;
- validation/check-only step;
- audit record;
- no automatic SAP Master changes;
- no automatic publication.

## 7. Recommended technical architecture

### Application

- Responsive PWA frontend using reusable components based on the supplied Theme
- Python API layer aligned with the current ESIP Python code
- Existing PostgreSQL remains the operational warehouse
- Background jobs call the existing governed pipeline rather than duplicating it

### Security

- Company SSO is preferred
- Server-side role enforcement; hiding a button is not sufficient
- Secure HTTP-only sessions
- CSRF protection for state-changing requests
- Rate limiting and login/session audit
- Separate read APIs from controlled mutation APIs

### Data boundary

The browser must not connect directly to PostgreSQL or execute local scripts.
All operations pass through validated API services. Apply/reprocess actions must
reuse the existing backup, validation and audit controls.

### Hosting decision required before production

The current database and ingestion pipeline run in the ESIP environment. A hosted
PWA requires one of these:

1. Internal/intranet deployment near PostgreSQL — recommended first;
2. Cloud frontend with a secure company API gateway to the ESIP backend; or
3. Migration of the complete pipeline/data layer to approved cloud infrastructure.

Do not expose the local PostgreSQL port or filesystem directly to a public PWA.

## 8. Proposed delivery phases

### Phase 1 — PWA foundation and read-only dashboard

Deliver:

- Responsive shell based on supplied Theme
- Login placeholder/integration boundary
- Executive Dashboard
- Partner/MT list and detail
- SKU list and detail
- Daily Actions and system health
- PWA installation support
- Read-only API against current PostgreSQL views

### Phase 2 — Admin operations

Deliver:

- Admin Dashboard
- Source and file/batch management
- Product/Branch Mapping review
- Check-only approval workflow
- Publication readiness review
- Audit and backup views

### Phase 3 — Controlled mutations and security

Deliver:

- SSO and full RBAC
- Apply Mapping with backup/audit
- OSCN request tracking
- Controlled reprocess
- Publication governance approval
- User/role administration

### Phase 4 — Business reporting expansion

Depends on additional data:

- YoY/MoM
- GP/Margin
- Target/Achievement/Forecast
- Stock on Order and Last Receive
- Province/region map
- TA Daily Raw

## 9. Deliverables available now

1. Working Daily Raw pipeline and PostgreSQL foundation
2. Verified Excel operational Preview
3. Mapping and publication governance workflows
4. Theme assessment and PWA/Admin scope in this document
5. Theme assets as reference prototypes
6. Handoff document at `HANDOFF.md`

## 10. Next recommended action

Start Phase 1 with the supplied dark enterprise Theme, but build it as a fresh
component-based PWA. Use the current ESIP PostgreSQL views for read-only APIs first.
Keep all approvals as review/check-only until authentication, RBAC, backups and audit
are verified end-to-end.

Before production hosting, confirm:

- internal/intranet or cloud deployment;
- company SSO provider;
- initial Admin user owners;
- whether file upload is allowed from the browser;
- which datasets each role may export.
