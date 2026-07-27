# ESIP Handoff

Updated: 2026-07-24 13:18 Asia/Bangkok

## PWA Production Delivery — 2026-07-24

- Private production URL: https://esip-enterprise-intelligence.n-chaiwat.chatgpt.site
- Saved site version: 1
- Source commit: `9cf0ac35745b9175078b92ce3add82f074a406b7`
- Local PWA source: `D:\Python\ESIP\pwa`
- Theme source used: `stitch_enterprise_sales_intelligence_platform.zip`
- Build, lint, and rendered-page tests passed.
- PWA manifest, service worker, mobile navigation, social preview, and install support are included.
- Main pages delivered: Executive Dashboard, Admin Confirm, Source Health, and Audit Trail.
- Admin decisions are stored durably in D1 and require an approval reference.
- Permission checks run on the server. The first authenticated private-site user is bootstrapped as `SYSTEM_ADMIN`; other users remain read-only until an administrator adds their role.
- Confirmation records currently provide a governed approval and audit layer only. They do not directly edit SAP, update the local PostgreSQL pipeline, or automatically publish facts.
- Next integration step: add a secure gateway between the hosted PWA and the local ESIP approval/apply workflow, including reconciliation and failure reporting.

## Local App Delivery — 2026-07-24

- Local trial URL: http://localhost:3000
- Start by double-clicking `Start_ESIP_Local.cmd`, or choose menu item 7 in `ESIP_Menu.cmd`.
- Stop by double-clicking `Stop_ESIP_Local.cmd`, or choose menu item 8.
- The launcher starts in the background and opens the browser automatically.
- Localhost uses the dedicated `local-admin@esip.local` trial identity and can access Admin Confirm.
- Local decisions persist in the project-local D1 database and retain their audit trail between restarts.
- Local Admin Confirm is still governance-only: it does not edit SAP, apply PostgreSQL mappings, or publish facts automatically.
- Validation on 2026-07-24: local mode detected, Admin permission true, 4 queue items available, lint/build/tests passed.

## Docker PWA + Three Roles — 2026-07-24

- Docker Compose file: `D:\Python\ESIP\docker-compose.yml`
- Local services: PWA web and local-only ESIP Apply Bridge.
- Roles are now exactly `ADMINISTRATOR`, `SALE_ADMIN`, and `USER`.
- Administrator: all frontend, confirm, audit, user-role, and settings access.
- Sale Admin: sales data, confirm, and audit; settings denied.
- User: frontend-only; confirm, audit, users API, and settings denied.
- Localhost includes a trial role switcher. Hosted access resolves role from authenticated email.
- Administrator and Sale Admin use Confirm & Apply. The governed queue is validated first.
- Apply uses existing ESIP `apply_approval_result`, governance backup, and file audit behavior.
- PWA status changes to approved/applied only after the local apply call succeeds.
- Invalid or aggregate summary items remain pending and return a safe validation error.
- Administrator user-role endpoint is available at `/api/users`; Sale Admin and User receive HTTP 403.
- Validation completed: all Python tests passed, Ruff passed, PWA lint/build/tests passed, all three roles verified, exact product dry-run validation passed, aggregate apply safely rejected without state change.

## Item Queue + Reference Reports + Theme — 2026-07-24

- Removed aggregate confirmation cards from the Local PWA workflow.
- Local queue now exposes 33 actionable product items and 677 actionable branch items.
- Product and branch dry-run validation both passed without changing files.
- Confirm applies one governed item at a time; Reject records a durable local rejection.
- Added queue type filter and search by MT, SKU, branch, candidate, or evidence.
- Added Light/Dark theme toggle with saved device preference.
- Added `รายงาน Sale Out` using live PostgreSQL data:
  - Daily sales trend
  - Sales by MT
  - Top 15 branches
  - Top 15 SKU
  - Latest stock on hand by MT
  - Reference coverage and missing-input status
- Added source history page showing first date, latest date, and available days by MT.
- Current live range: 2026-07-11 through 2026-07-22, 12 distinct dates, 6 active MT sources.
- Reference Excel inspection found that its main 2025-2026 summary sheet contains many broken external `#REF!` formulas; the focused comparison sheet remains readable.
- Current Dashboard reference coverage:
  - Available: daily trend, MT comparison, top branches, top SKU, stock on hand.
  - Waiting: 2025 Daily Raw for YoY, Cost/COGS for GP/Margin, Target/Forecast inputs, stock order/receipt history.
- Data quality warning: DH and HH currently have sales QTY rows but zero sales amount in PostgreSQL.

## PWA direction added 2026-07-24

ผู้ใช้ส่ง Theme ที่ `stitch_enterprise_sales_intelligence_platform.zip` และต้องการ
ให้ PWA มี Backend สำหรับ Admin จัดการระบบ

ตรวจแล้ว:

- Theme มี Static HTML 19 หน้า, Screenshot 21 ภาพ และ Design System
- ใช้เป็น Visual Design Foundation ได้
- ยังไม่ใช่ Production PWA และต้องแปลงเป็น Components, Routes และ API
- ไม่มี manifest/service worker, authentication, RBAC หรือ Backend integration
- มี external CDN/fonts/images ที่ต้องนำออกหรือจัดการใหม่ก่อน Production

ขอบเขต PWA, Backend Admin, Roles, Architecture และ Delivery phases อยู่ที่:

`PWA_DELIVERY_PLAN.md`

ลำดับถัดไปที่แนะนำคือสร้าง Phase 1 แบบ read-only ก่อน:

1. PWA shell จาก Theme
2. Executive Dashboard
3. Partner/MT และ SKU detail
4. Daily Actions/System Health
5. Read-only API จาก PostgreSQL views

จากนั้นจึงเพิ่ม Admin operations และ controlled mutations หลัง SSO/RBAC/Audit
พร้อมใช้งานครบ

## สถานะส่วนหลัก

ระบบ Daily Raw หลักอยู่ในสถานะใช้งานและตรวจสอบได้แล้ว:

- Workspace หลัก: `D:\Python\ESIP`
- Preview ล่าสุด: `output/reports/ESIP_Daily_Raw_Preview.xlsx`
- Daily Run ล่าสุด: `output/daily_runs/latest_run.md`
- ผล Daily Run ล่าสุด: PASS
- Automated tests: 80 tests passed
- Static checks: passed
- Approval Check แบบไม่เปลี่ยนข้อมูล: passed
- ไม่มี `.tmp_review`, `.tmp_daily` หรือ `node_modules` junction ตกค้าง

MT ที่ประมวลผลอยู่:

- DH — DoHome
- GBH — Global House
- HH — HomeHub
- HP — HomePro
- MH — MegaHome
- TWD — Thai Watsadu

TA เตรียมไว้แล้วแต่ยังปิดการประมวลผลจนกว่าจะมี Daily Raw:

- TA = Thai Aus
- SAP CardCode แบบ exact: `COT-0165`
- Incoming path: `SourceFiles/TA/incoming`

## ผลข้อมูลล่าสุด

- Governed manifest: 78/78 files
- Daily Raw files: 75
- PostgreSQL: 12 tables / 9 views
- Import batches: 83
- Reconciliations: 98 และผ่านทั้งหมด
- Source rows: 1,212,951
- Loaded facts: 265,721
- Quarantined rows: 947,230
- Product Mapping queue: 2,891 source product codes
- Branch Mapping queue: 677 source branch identities
- Publication: 0 ready / 83 blocked

Candidate ที่ระบบมีหลักฐานพร้อมให้คนตรวจ:

- Product: 33 รายการ
  - Exact Item Master barcode: 2
  - Unique cross-source OSCN: 31 (MH)
- Branch high-confidence: 195 รายการ
  - Source branch-name match: 142
  - Same-code name enrichment: 53
- Candidate Quality gate: PASS, 0 issues

Candidate Quality จะตรวจทุก Daily Run และหยุดก่อนสร้าง Preview หากพบ:

- Product candidate ไม่มีหรือมีมากกว่า 1 SAP ItemCode
- Branch candidate ไม่มี CardCode
- Branch confidence ต่ำกว่า 0.95
- Source branch code เดียวกันชี้ไปหลาย CardCode

รายงานอยู่ที่:

`output/operations/mapping_candidate_quality.json`

## สิ่งที่ผู้ใช้เปิดดูได้

เปิด `output/reports/ESIP_Daily_Raw_Preview.xlsx`

Sheets สำคัญ:

1. `Dashboard` — ภาพรวมระบบและ Publication readiness
2. `Daily Action List` — สิ่งที่ต้องทำต่อ เรียงตามความสำคัญ
3. `Manual Report Coverage` — เปรียบเทียบกับรายงาน Manual เดิม
4. `Input Freshness` — วันที่ล่าสุดและความล่าช้าของแต่ละ MT
5. `Input File Safety` — ความเสี่ยงชื่อไฟล์ HH และไฟล์เนื้อหาซ้ำ
6. `Product Mapping` — รายการ Barcode ตรง/OSCN ข้าม MT ถูกเรียงไว้บนสุด
7. `Branch Approval` — High-confidence candidates ถูกเรียงไว้บนสุด
8. `Mapping Action Plan` — จำนวนคิวและ Candidate Quality gate
9. `Publication Readiness` — เหตุผลที่แต่ละ batch ยัง Publish ไม่ได้
10. `Approval Instructions` — วิธีตรวจและอนุมัติ

## การใช้งานประจำวัน

เริ่มจาก:

`ESIP_Menu.cmd`

หรือใช้:

- `Run_ESIP_Daily.cmd` — ประมวลผลและสร้าง Preview
- `Open_ESIP_Result.cmd` — เปิดผลล่าสุด
- `Prepare_HH_Download_Folder.cmd` — สร้างโฟลเดอร์ HH พร้อมวันที่
- `Check_ESIP_Approvals.cmd` — ตรวจไฟล์อนุมัติ ไม่เปลี่ยนข้อมูล
- `Apply_ESIP_Approvals.cmd` — ใช้เฉพาะหลัง Check ผ่านและผู้ใช้ตั้งใจ Apply
- `Check_Publication_Readiness.cmd` — ตรวจ Publication gates
- `Reprocess_After_OSCN_Change.cmd` — ใช้หลังได้รับ OSCN export รุ่นใหม่

ข้อควรจำ:

- Product approval สร้าง OSCN change request เท่านั้น ไม่แก้ SAP โดยตรง
- Branch approval อัปเดต governed crosswalk หลัง validation
- Publication approval เปลี่ยน governance status เท่านั้น ไม่ Publish facts
- Apply operations สำรองไฟล์/ข้อมูลก่อนเปลี่ยน และเขียน audit log

## Reference ที่ตรวจแล้ว

- `ReferenceFiles/สรุป Sale Out.xlsx`
- `ReferenceFiles/Current Dashboard 2026-07-08.docx`

สิ่งที่ระบบทำได้แล้ว:

- Daily Sales Trend
- Top Branch
- Top SKU
- Stock on Hand
- Mapping/Quarantine/Publication monitoring

สิ่งที่ยังต้องมีข้อมูลเพิ่มเพื่อเทียบ Manual:

- Daily Raw ย้อนหลังปี 2025 สำหรับ YoY
- ประวัติหลายเดือนสำหรับ MoM และ Monthly SKU Matrix
- Cost/COGS สำหรับ GP และ Margin
- Target/Forecast สำหรับ Achievement
- Stock on Order และ Last Receive
- Province/พื้นที่ของสาขาสำหรับแผนที่
- TA Daily Raw sales/inventory

## งานที่ควรทำครั้งหน้า

ทำตามลำดับนี้:

1. ตรวจว่ามี Daily Raw หรือ Master Data ใหม่หลัง 2026-07-23 หรือไม่
2. รัน `Run_ESIP_Daily.cmd` และยืนยัน Daily Run PASS
3. ให้ผู้ใช้ตรวจ Product candidates 33 รายการแรกและ Branch candidates 195 รายการแรก
4. เมื่อผู้ใช้กรอก `mapping_status` และ `approval_reference`:
   - รัน Check ก่อนเสมอ
   - Apply เฉพาะเมื่อผู้ใช้ยืนยัน
5. ส่ง `oscn_change_requests.csv` ให้ SAP administrator
6. เมื่อได้รับ OSCN export ใหม่:
   - วางใน governed OSCN incoming path
   - รัน reprocess
   - ยืนยัน reconciliation ไม่เปลี่ยนและ quarantine ไม่เพิ่ม
7. ทำ Mapping remediation ซ้ำจน quarantine ลดลง
8. เปิด TA เมื่อได้รับตัวอย่าง Daily Raw และสร้าง/ตรวจ profile สำเร็จ
9. เพิ่ม Historical/Cost/Target/Order/Province data เมื่อผู้ใช้ส่งมา

## งานเชิงเทคนิคที่ยังปรับปรุงได้

- Product priority ของ GBH ตอนนี้อิงจำนวน quarantined rows ซึ่งหลาย SKU มีจำนวน
  เท่ากันจาก wide report; ควรพิจารณาเพิ่ม business-impact measure จาก sales amount,
  sales quantity หรือ inventory quantity เพื่อจัดลำดับที่มีความหมายกว่าเดิม
- เพิ่ม unit test สำหรับ Publication approval path ที่ใช้ PostgreSQL `ANY(%s)`
  แม้ static checks และ workflow ปัจจุบันผ่าน แต่ยังไม่มี ready batch ให้ทดสอบจริง
- ถ้าต้องการ render DOCX แบบเต็มหน้าในเครื่องนี้ ต้องมี LibreOffice/soffice;
  การตรวจครั้งล่าสุดใช้โครงสร้าง DOCX และ embedded screenshots ทั้ง 7 ภาพ
- Git history เดิมยังไม่มีใน copied workspace (`.git` ว่าง); ต้องนำมาจาก repository
  ต้นทางหรือ remote หากต้องการ version history

## คำสั่งตรวจเริ่มงานครั้งหน้า

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check src tests scripts --exclude build_daily_raw_preview.mjs
.\.venv\Scripts\python.exe scripts\run_daily.py
```

ผลที่คาด:

- 80 tests passed (หรือมากกว่า หากมีการเพิ่ม test)
- `All checks passed!`
- Daily Run PASS
- Preview ถูกสร้างใหม่ที่ `output/reports/ESIP_Daily_Raw_Preview.xlsx`

## ข้อห้ามในการเริ่มต่อ

- อย่าอนุมัติ Mapping แทนผู้ใช้
- อย่าแก้ SAP Master โดยตรง
- อย่า Publish facts อัตโนมัติ
- อย่าลบ Daily Raw, Master Data, Preview archives หรือ governance backups
- อย่านำ KPI by SKU หรือ legacy SQLite path กลับมา เว้นแต่ผู้ใช้ขออย่างชัดเจน
# Update 2026-07-24 — Import Center

- เพิ่มหน้า `นำเข้าข้อมูล` สำหรับ Administrator และ Sale Admin ใน Local PWA
- รองรับ Upload หลายไฟล์, Auto Detect MT จากชื่อไฟล์, เลือก MT เอง และ Upload & Process ทันที
- รองรับ Folder inbox เดิมและปุ่ม `Process ทุก MT`
- เพิ่ม scheduler เวลา 08:00 Asia/Bangkok ทุกวัน (ตั้งค่าผ่าน `ESIP_AUTO_IMPORT_*`)
- เพิ่มประวัติ Upload/Process แบบถาวรที่ `output/operations/import_history.jsonl`
- เพิ่ม Telegram notification หลัง Process; ยังต้องกรอก `ESIP_TELEGRAM_BOT_TOKEN` และ `ESIP_TELEGRAM_CHAT_ID` ใน `.env`
- API bridge ป้องกัน Process ซ้อน และจำกัด Upload 250 MB ต่อไฟล์
- Local URL ยังคงเป็น `http://localhost:3000`
- งานถัดไป: เพิ่ม date/source filters, target/forecast input และ executive dashboard metrics เมื่อได้ข้อมูลดังกล่าว

## Update 2026-07-24 — Enterprise Dashboard + Telegram

- ขยายหน้า Dashboard เป็น Enterprise Performance Map ครบ 12 modules
- ส่วน LIVE ใช้ข้อมูลจริง: Executive Summary, Sales Performance, Product, Branch, Inventory และ Data Quality
- ส่วนที่ยังไม่มีข้อมูลแสดง `WAITING DATA`: Target, Forecast, GP/Margin, YoY, Stock Aging และ On Order/Supply
- เพิ่ม Daily Momentum, MT Contribution, Management Signals, Stock on Hand และ Module Readiness
- Telegram ใช้ Header รูปแบบ `🏢 ESIP · วัน เดือน พ.ศ. เวลา น.` ตามด้วยเส้นคั่น หัวข้อ และรายละเอียดพร้อม Emoji
- Telegram Bot Token และ Chat ID เก็บใน `.env` เท่านั้น ห้ามนำไปใส่ Source Code หรือเอกสาร
- ทดสอบ `telegram-test` สำเร็จ (`sent=true`)
- Build สำเร็จ และ Local PWA ตอบสนองที่ `http://localhost:3000`

## Update 2026-07-24 — Mapping Correction

- หน้า Admin Confirm รองรับการแก้รหัส SAP ที่ระบบแนะนำแล้ว
- ผู้ใช้กด `รหัสที่แนะนำไม่ถูกต้อง — แก้ไขรหัส SAP`
- ค้นหาได้ด้วย CardCode/ชื่อสาขา หรือ ItemCode/ชื่อสินค้า
- ระบบตรวจรหัสใหม่กับ Branch Master หรือ Item Master ก่อน Apply
- การ Override ยังต้องกรอกผู้ตรวจ/เอกสารอ้างอิงและถูกบันทึกใน Audit
- ตรวจ `K:\SaleOut_RPT` แล้ว Process ปัจจุบันมองไม่เห็น mapped drive นี้
- ก่อนเปิด External RAW automation ต้องใช้ UNC path เช่น `\\server\share\SaleOut_RPT` หรือทำให้ service account มองเห็น network share
- External source ต้องเป็น read/copy-only ห้ามย้าย แก้ หรือลบ RAW ต้นฉบับ

## Update 2026-07-24 — NAS Auto Import

- UNC source confirmed: `\\wa-nas-it03\FileShare-2\SaleOut_RPT`
- Folder mapping: `DH→DH`, `GBH→GBH`, `HomeHub→HH`, `HP_MH→HP_MH`, `TWD→TWD`
- `scripts/sync_nas_raw.py` reads today/yesterday, copies only allowed RAW formats, verifies SHA-256 and never changes NAS files
- Duplicate prevention ledger: `output/operations/nas_sync_ledger.json`
- Latest sync report: `output/operations/nas_sync_latest.json`
- Windows Scheduled Task: `ESIP NAS Auto Import`, daily 08:15, interactive user `WA\Chaiwat.N`
- 08:15 was selected because GBH was observed arriving at about 08:05
- First live sync copied 16 files and `NAS_AUTO_SYNC` processing completed `PASS`; Telegram sent successfully
- Second sync returned `NO_NEW_FILES`, `copied_count=0`, `skipped_count=16`
- PostgreSQL coverage after sync: latest sales date `2026-07-24`, 16 available dates
- 136 exact duplicate local incoming files were moved (not deleted) to `output/quarantine/nas_sync_duplicates/`; recoverable
- Container internal scheduler is disabled to prevent overlap; App reports external scheduler mode and 08:15 schedule
