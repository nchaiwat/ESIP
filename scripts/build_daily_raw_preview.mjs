import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const previewPath = process.argv[4];
const qaAllSheets = process.argv.includes("--qa-all");
const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
const workbook = Workbook.create();

const dashboard = workbook.worksheets.add("Dashboard");
const actionList = workbook.worksheets.add("Daily Action List");
const coverage = workbook.worksheets.add("Coverage");
const freshness = workbook.worksheets.add("Input Freshness");
const inputSafety = workbook.worksheets.add("Input File Safety");
const manualCoverage = workbook.worksheets.add("Manual Report Coverage");
const batches = workbook.worksheets.add("Batch History");
const trend = workbook.worksheets.add("Daily Trend");
const details = workbook.worksheets.add("Rankings");
const quarantine = workbook.worksheets.add("Quarantine");
const productQueue = workbook.worksheets.add("Product Mapping");
const branchQueue = workbook.worksheets.add("Branch Approval");
const publicationQueue = workbook.worksheets.add("Publication Readiness");
const mappingPlan = workbook.worksheets.add("Mapping Action Plan");
const instructions = workbook.worksheets.add("Approval Instructions");

const navy = "#17365D";
const blue = "#1F4E78";
const orange = "#ED7D31";
const paleBlue = "#D9EAF7";
const paleOrange = "#FCE4D6";
const paleGreen = "#E2F0D9";
const lightGray = "#F2F2F2";

instructions.showGridLines = false;
instructions.getRange("A1:B2").merge();
instructions.getRange("A1").values = [["Approval Instructions / วิธีอนุมัติ Mapping"]];
instructions.getRange("A1:H2").format = {
  fill: navy,
  font: { bold: true, color: "#FFFFFF", size: 18 },
  verticalAlignment: "center",
};
instructions.getRange("A4:B4").values = [["Step", "สิ่งที่ต้องทำ"]];
instructions.getRange("A5:B10").values = [
  [1, "เปิด Sheet Product Mapping หรือ Branch Approval แล้วตรวจ Candidate ทีละรายการ"],
  [2, "แก้เฉพาะ mapping_status, candidate และ approval_reference; ห้ามแก้รหัสต้นทาง"],
  [3, "ถ้าเลือก APPROVED ต้องมี approval_reference เช่นเลขอีเมล เลข Ticket หรือชื่อผู้อนุมัติพร้อมวันที่"],
  [4, "Product Mapping ที่อนุมัติจะถูกส่งเป็น OSCN change request เท่านั้น ระบบจะไม่แก้ SAP Master โดยตรง"],
  [5, "Branch Approval ที่อนุมัติจะถูกเพิ่มใน branch crosswalk หลังผ่านการตรวจรหัส SAP"],
  [6, "บันทึกไฟล์ แล้วดับเบิลคลิก Check_ESIP_Approvals.cmd ก่อนใช้ Apply_ESIP_Approvals.cmd; ระบบจะขอยืนยันอีกครั้ง"],
];
instructions.getRange("A4:B4").format = {
  fill: blue,
  font: { bold: true, color: "#FFFFFF" },
};
instructions.getRange("A5:A10").format = {
  fill: paleBlue,
  font: { bold: true, color: navy },
  horizontalAlignment: "center",
};
instructions.getRange("B5:B10").format = { wrapText: true, verticalAlignment: "top" };
instructions.getRange("A4:B10").format.borders = {
  preset: "inside",
  style: "thin",
  color: "#D9E1F2",
};
instructions.getRange("A:A").format.columnWidth = 10;
instructions.getRange("B:B").format.columnWidth = 95;
instructions.getRange("A5:B10").format.rowHeight = 34;
instructions.freezePanes.freezeRows(4);

function writeDataSheet(sheet, headers, rows, widths = []) {
  const matrix = [headers, ...rows];
  sheet.getRangeByIndexes(0, 0, matrix.length, headers.length).values = matrix;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: blue,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRangeByIndexes(0, 0, matrix.length, headers.length).format.borders = {
    preset: "inside",
    style: "thin",
    color: "#D9E1F2",
  };
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = false;
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, matrix.length, 1).format.columnWidth = width;
  });
}

function columnLetter(oneBasedIndex) {
  let value = oneBasedIndex;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

writeDataSheet(
  coverage,
  ["Source", "Dataset", "Loaded Rows", "Quarantined Rows", "Total Rows", "Mapping Rate"],
  data.coverage.map((r) => [
    r.source_code, r.dataset, r.staged_rows, r.quarantined_rows, r.total_rows, r.staged_rate,
  ]),
  [12, 14, 16, 20, 14, 15],
);
coverage.getRange(`C2:E${data.coverage.length + 1}`).format.numberFormat = "#,##0";
coverage.getRange(`F2:F${data.coverage.length + 1}`).format.numberFormat = "0.0%";

writeDataSheet(
  freshness,
  [
    "Source", "Source Name", "Enabled", "Latest Sales Date", "Sales Days Behind",
    "Sales Status", "Latest Inventory Date", "Inventory Days Behind", "Inventory Status",
  ],
  data.freshness.map((r) => [
    r.source_code, r.source_name, r.enabled, r.latest_sales_date, r.sales_days_behind,
    r.sales_status, r.latest_inventory_date, r.inventory_days_behind, r.inventory_status,
  ]),
  [12, 22, 12, 20, 20, 30, 22, 24, 30],
);
freshness.getRange(`D2:D${data.freshness.length + 1}`).format.numberFormat = "yyyy-mm-dd";
freshness.getRange(`G2:G${data.freshness.length + 1}`).format.numberFormat = "yyyy-mm-dd";
freshness.getRange(`E2:E${data.freshness.length + 1}`).format.numberFormat = "0";
freshness.getRange(`H2:H${data.freshness.length + 1}`).format.numberFormat = "0";
data.freshness.forEach((row, index) => {
  const rowNumber = index + 2;
  const statuses = [row.sales_status, row.inventory_status];
  const fill = statuses.includes("WAITING_FOR_FIRST_DAILY_RAW")
    ? paleOrange
    : statuses.includes("NO_DATA") || statuses.includes("LAGGING")
      ? "#FFF2CC"
      : paleGreen;
  freshness.getRange(`A${rowNumber}:I${rowNumber}`).format.fill = fill;
});

writeDataSheet(
  inputSafety,
  [
    "Source / MT", "จำนวนไฟล์", "ไฟล์ที่มีวันที่หรือชื่อไม่ซ้ำ",
    "ไฟล์ที่เสี่ยงถูกเขียนทับ", "กลุ่มเนื้อหาซ้ำ", "จำนวนไฟล์เนื้อหาซ้ำ",
    "สถานะชื่อไฟล์", "สถานะเนื้อหาซ้ำ", "คำแนะนำ",
    "ไฟล์ที่ต้องระวัง", "ตำแหน่งไฟล์เนื้อหาซ้ำ",
  ],
  data.input_safety.map((row) => [
    row.source_code, row.file_count, row.dated_or_unique_file_count,
    row.undated_file_count, row.duplicate_group_count, row.duplicate_file_count,
    row.status, row.duplicate_status, row.recommendation,
    row.undated_files, row.duplicate_files,
  ]),
  [14, 14, 28, 24, 20, 22, 32, 32, 42, 44, 60],
);
inputSafety.getRange(`B2:F${data.input_safety.length + 1}`).format.numberFormat = "0";
data.input_safety.forEach((row, index) => {
  const fill = row.status === "ATTENTION_UNDATED_FILES"
    || row.duplicate_status === "ATTENTION_DUPLICATE_CONTENT"
    ? paleOrange
    : row.status === "WAITING_FOR_FIRST_DAILY_RAW"
      ? lightGray
      : paleGreen;
  inputSafety.getRange(`A${index + 2}:K${index + 2}`).format.fill = fill;
});

const trendDates = data.trend.map((row) => row.sales_date).filter(Boolean);
const historyEvidence = trendDates.length > 0
  ? `${trendDates[0]} ถึง ${trendDates[trendDates.length - 1]} `
    + `(${trendDates.length} วันที่มีข้อมูลรวม)`
  : "ยังไม่มีข้อมูล Sales";
const manualCoverageRows = [
  [
    "ยอดขายรายเดือน MoM / YoY", "NEED_MORE_HISTORY",
    "มี Daily Trend และยอดรวมตาม Source", historyEvidence,
    "ต้องมี Daily Raw ย้อนหลังอย่างน้อยถึงช่วงเปรียบเทียบปี 2025",
    "Daily Trend / Rankings",
  ],
  [
    "Focus Sale Out ช่วงวันที่เทียบปีก่อน", "NEED_MORE_HISTORY",
    "มี QTY และ Amount รายวันตามข้อมูลที่นำเข้า", historyEvidence,
    "Daily Raw ของช่วงวันที่เดียวกันในปีก่อน", "Daily Trend",
  ],
  [
    "Top Branch", "AVAILABLE",
    "Top 15 Branch ตาม Net Amount และ Net QTY", "ข้อมูลปัจจุบันใน PostgreSQL",
    "Branch Mapping ที่อนุมัติครบจะเพิ่มความน่าเชื่อถือ", "Rankings",
  ],
  [
    "Top SKU", "AVAILABLE",
    "Top 15 SAP ItemCode / Source SKU", "เฉพาะรายการที่ Product Mapping สำเร็จ",
    "แก้ OSCN เพื่อเพิ่ม Mapping Coverage", "Rankings / Product Mapping",
  ],
  [
    "Monthly SKU Matrix", "PARTIAL",
    "มี Transaction ระดับวันและ SKU ใน PostgreSQL", historyEvidence,
    "ประวัติหลายเดือนและ Product Mapping ที่ครบ", "PostgreSQL / Product Mapping",
  ],
  [
    "Stock On Hand", "AVAILABLE",
    "มี Latest Inventory แยก Source", "Daily Raw Inventory ปัจจุบัน",
    "เพิ่มไฟล์ใหม่ตาม Input Freshness", "Rankings / Input Freshness",
  ],
  [
    "Stock On Order / Last Receive Date", "NOT_STANDARDIZED",
    "ยังไม่มีฟิลด์มาตรฐานกลาง", "บางไฟล์ต้นทางอาจมีเฉพาะบาง MT",
    "กำหนด Data Contract และหา Raw Field ของทุก MT", "ยังไม่มี",
  ],
  [
    "Last Sold Date / Stock Age / Dead Stock", "PARTIAL",
    "คำนวณ Last Sold Date ได้จาก Sales ที่นำเข้า", historyEvidence,
    "ต้องมีประวัติยาวพอและนิยาม Stock Age/Dead Stock", "PostgreSQL (ต้องสร้างเพิ่ม)",
  ],
  [
    "Gross Profit / Margin", "NEED_COST_DATA",
    "มี Sales Amount ex VAT หลังส่วนลดบาง Source", "ไม่มี Cost/COGS มาตรฐาน",
    "ข้อมูลต้นทุนที่อนุมัติจาก SAP พร้อม Effective Date", "ยังไม่มี",
  ],
  [
    "Target / Achievement / Forecast", "NEED_TARGET_DATA",
    "มี Actual Sales", "ไม่มี Target และ Forecast input",
    "Target รายเดือนตาม Source/Branch/SKU และกติกา Forecast", "ยังไม่มี",
  ],
  [
    "Province / Heat Map", "NEED_BRANCH_ENRICHMENT",
    "มี Source Branch identity", "ยังไม่มี Province ที่อนุมัติครบ",
    "อนุมัติ Branch Crosswalk และเพิ่ม Province dimension", "Branch Approval",
  ],
  [
    "AI Insight / Alert", "FUTURE_AFTER_GOVERNANCE",
    "มีฐานข้อมูลที่ตรวจสอบย้อนกลับได้", "Publication ยัง Block และ History ยังสั้น",
    "Mapping ครบ, Quarantine เป็นศูนย์ และมีประวัติเพียงพอ", "Daily Action List",
  ],
];
writeDataSheet(
  manualCoverage,
  [
    "มุมมองจาก Manual", "สถานะ", "สิ่งที่มีแล้ว", "หลักฐานปัจจุบัน",
    "ข้อมูล/งานที่ยังต้องเพิ่ม", "ดูได้ที่",
  ],
  manualCoverageRows,
  [34, 28, 52, 48, 58, 30],
);
manualCoverage.getRange(
  `C2:E${manualCoverageRows.length + 1}`,
).format.wrapText = true;
manualCoverage.getRange(
  `A2:F${manualCoverageRows.length + 1}`,
).format.rowHeight = 42;
manualCoverageRows.forEach((row, index) => {
  const fill = row[1] === "AVAILABLE"
    ? paleGreen
    : row[1] === "PARTIAL"
      ? paleBlue
      : row[1].startsWith("NEED_") || row[1] === "NOT_STANDARDIZED"
        ? "#FFF2CC"
        : lightGray;
  manualCoverage.getRange(`A${index + 2}:F${index + 2}`).format.fill = fill;
});

const actionRows = [];
data.input_safety
  .filter((row) => row.status === "ATTENTION_UNDATED_FILES")
  .forEach((row) => {
    actionRows.push([
      "HIGH", "FILE SAFETY", row.source_code,
      "ก่อนดาวน์โหลดครั้งถัดไป ให้เก็บไฟล์ในโฟลเดอร์วันที่หรือเติมวันที่ดาวน์โหลดท้ายชื่อไฟล์",
      `${row.undated_file_count} ไฟล์เสี่ยงถูกเขียนทับ: ${row.undated_files}`,
      "ATTENTION_UNDATED_FILES",
    ]);
  });
data.input_safety
  .filter((row) => row.duplicate_status === "ATTENTION_DUPLICATE_CONTENT")
  .forEach((row) => {
    actionRows.push([
      "HIGH", "DUPLICATE RAW", row.source_code,
      "ตรวจไฟล์ที่มีเนื้อหาซ้ำและเก็บไว้เพียงตำแหน่งที่กำกับดูแล หลังยืนยันกับผู้รับผิดชอบ",
      `${row.duplicate_group_count} กลุ่ม / ${row.duplicate_file_count} ไฟล์: `
        + row.duplicate_files,
      "ATTENTION_DUPLICATE_CONTENT",
    ]);
  });
data.freshness.forEach((row) => {
  const waiting = row.sales_status === "WAITING_FOR_FIRST_DAILY_RAW"
    || row.inventory_status === "WAITING_FOR_FIRST_DAILY_RAW";
  if (waiting) {
    actionRows.push([
      "WAITING", "INPUT", row.source_code,
      "เตรียม Daily Raw Sales และ Inventory ชุดแรกเมื่อมีไฟล์",
      `${row.source_name}; เตรียม Profile ไว้แล้ว แต่ยังไม่เปิดใช้งานจนกว่าจะตรวจตัวอย่างไฟล์`,
      "WAITING_FOR_DATA",
    ]);
    return;
  }
  const lagging = [];
  if (row.sales_status === "LAGGING") {
    lagging.push(`Sales ${row.sales_days_behind} day(s)`);
  }
  if (row.inventory_status === "LAGGING") {
    lagging.push(`Inventory ${row.inventory_days_behind} day(s)`);
  }
  if (lagging.length > 0) {
    const maxLag = Math.max(
      Number(row.sales_days_behind || 0),
      Number(row.inventory_days_behind || 0),
    );
    actionRows.push([
      maxLag >= 2 ? "HIGH" : "MEDIUM", "INPUT", row.source_code,
      "ตรวจว่ามี Daily Raw ที่ใหม่กว่าหรือไม่ และนำมาเพิ่มโดยไม่แก้ไขไฟล์เดิม",
      lagging.join("; ").replaceAll("Sales", "Sales ตามหลัง")
        .replaceAll("Inventory", "Inventory ตามหลัง")
        .replaceAll("day(s)", "วัน"),
      "CHECK_NEWER_FILE",
    ]);
  }
});
if (trendDates.length < 60) {
  actionRows.push([
    "MEDIUM", "HISTORICAL DATA", "ALL",
    "หากต้องการ MoM/YoY แบบ Manual ให้เพิ่ม Daily Raw ย้อนหลังถึงช่วงเปรียบเทียบปี 2025",
    historyEvidence,
    "NEED_MORE_HISTORY",
  ]);
}
const p1Products = data.product_queue.filter(
  (row) => row.priority_tier === "P1_FIRST_50_PERCENT",
);
const highConfidenceBranches = data.branch_queue.filter(
  (row) => row.recommendation === "HIGH_CONFIDENCE_CANDIDATE",
);
const evidenceProducts = data.product_queue.filter(
  (row) => ["EXACT_ITEM_MASTER_BARCODE", "UNIQUE_CROSS_SOURCE_OSCN"]
    .includes(row.candidate_basis),
);
const blockedBatches = data.publication_queue.filter(
  (row) => row.readiness_status === "BLOCKED",
);
actionRows.push([
  "HIGH", "PRODUCT MAPPING", "ALL",
  "ตรวจ Product Mapping กลุ่ม P1 ก่อน แล้วส่งรายการที่อนุมัติเป็นคำขอแก้ไข OSCN",
  `${p1Products.length} รหัสสินค้า; `
    + `${p1Products.reduce(
      (sum, row) => sum + Number(row.total_affected_rows || 0), 0,
    ).toLocaleString("en-US")} แถวได้รับผลกระทบ`,
  "PENDING_APPROVAL",
]);
actionRows.push([
  "HIGH", "BRANCH MAPPING", "ALL",
  "ตรวจ Candidate สาขาที่มีความมั่นใจสูง และระบุ approval_reference",
  `${highConfidenceBranches.length} รายการความมั่นใจสูง`,
  "PENDING_APPROVAL",
]);
actionRows.push([
  "MEDIUM", "PRODUCT EVIDENCE", "ALL",
  "ตรวจคำแนะนำสินค้าที่มีหลักฐาน Barcode ตรงหรือ OSCN ข้าม MT แบบไม่กำกวม",
  `${evidenceProducts.length} รหัสสินค้า; ไม่มีการอนุมัติอัตโนมัติ`,
  "PENDING_APPROVAL",
]);
actionRows.push([
  "BLOCKED", "PUBLICATION", "ALL",
  "ห้าม Publish จนกว่า Quarantine เป็นศูนย์และ Branch Mapping ครบทุกสาขา",
  `${blockedBatches.length} Batch ยังถูก Block`,
  blockedBatches.length > 0 ? "BLOCKED" : "READY_FOR_APPROVAL",
]);
const priorityOrder = { BLOCKED: 0, HIGH: 1, MEDIUM: 2, WAITING: 3 };
actionRows.sort((left, right) =>
  (priorityOrder[left[0]] ?? 9) - (priorityOrder[right[0]] ?? 9)
  || String(left[2]).localeCompare(String(right[2]))
);
writeDataSheet(
  actionList,
  [
    "Priority / ความสำคัญ", "Area / หัวข้อ", "Source / MT",
    "Recommended Action / สิ่งที่ควรทำ", "Evidence / หลักฐาน",
    "Current Status / สถานะ",
  ],
  actionRows,
  [14, 22, 12, 62, 58, 24],
);
actionList.getRange(`D2:E${actionRows.length + 1}`).format.wrapText = true;
actionList.getRange(`A2:F${actionRows.length + 1}`).format.rowHeight = 34;
actionRows.forEach((row, index) => {
  const fill = row[0] === "BLOCKED"
    ? paleOrange
    : row[0] === "HIGH"
      ? "#FFF2CC"
      : row[0] === "MEDIUM"
        ? paleBlue
        : lightGray;
  actionList.getRange(`A${index + 2}:F${index + 2}`).format.fill = fill;
});

writeDataSheet(
  batches,
  ["Source", "File", "Status", "Imported UTC", "Dataset", "Source Rows", "Loaded", "Quarantined", "Passed"],
  data.batches.map((r) => [
    r.source_code, r.source_file_name, r.status, r.imported_at_utc, r.dataset,
    r.source_rows, r.staged_rows, r.quarantined_rows, r.passed,
  ]),
  [10, 42, 16, 25, 12, 14, 14, 16, 10],
);
batches.getRange(`F2:H${data.batches.length + 1}`).format.numberFormat = "#,##0";

writeDataSheet(
  trend,
  ["Date", "Net QTY", "Net Amount"],
  data.trend.map((r) => [r.sales_date, r.net_qty, r.net_amount]),
  [14, 16, 20],
);
trend.getRange(`B2:B${data.trend.length + 1}`).format.numberFormat = "#,##0.00";
trend.getRange(`C2:C${data.trend.length + 1}`).format.numberFormat = "#,##0.00";

const rankingRows = [
  ["SALES BY SOURCE", null, null, null],
  ["Source", "Net QTY", "Net Amount", null],
  ...data.source_sales.map((r) => [r.source_code, r.net_qty, r.net_amount, null]),
  [null, null, null, null],
  ["TOP 15 BRANCHES", null, null, null],
  ["Source", "Branch", "Net QTY", "Net Amount"],
  ...data.top_branches.map((r) => [
    r.source_code, r.branch_source_name, r.net_qty, r.net_amount,
  ]),
  [null, null, null, null],
  ["TOP 15 PRODUCTS", null, null, null],
  ["SAP ItemCode", "Source SKU", "Net QTY", "Net Amount"],
  ...data.top_products.map((r) => [
    r.sap_item_code, r.source_sku, r.net_qty, r.net_amount,
  ]),
  [null, null, null, null],
  ["LATEST INVENTORY", null, null, null],
  ["Source", "Snapshot Date", "On-hand QTY", "On-hand Value"],
  ...data.inventory.map((r) => [
    r.source_code, r.snapshot_date, r.onhand_qty, r.onhand_value,
  ]),
];
details.getRangeByIndexes(0, 0, rankingRows.length, 4).values = rankingRows;
details.getRange("A1:D1").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
for (let row = 1; row <= rankingRows.length; row += 1) {
  const label = rankingRows[row - 1][0];
  if (typeof label === "string" && (label.startsWith("TOP ") || label.endsWith("SOURCE") || label === "LATEST INVENTORY")) {
    details.getRange(`A${row}:D${row}`).format = {
      fill: navy, font: { bold: true, color: "#FFFFFF" },
    };
  }
}
details.getRange(`C1:D${rankingRows.length}`).format.numberFormat = "#,##0.00";
details.getRange("A:D").format.columnWidth = 20;
details.getRange("B:B").format.columnWidth = 35;
details.freezePanes.freezeRows(1);
details.showGridLines = false;

writeDataSheet(
  quarantine,
  ["Source", "Dataset", "Reason", "Affected Rows"],
  data.quarantine.map((r) => [
    r.source_code, r.dataset, r.reason_code, r.affected_rows,
  ]),
  [12, 14, 30, 18],
);
quarantine.getRange(`D2:D${data.quarantine.length + 1}`).format.numberFormat = "#,##0";

const productHeaders = Object.keys(data.product_queue[0] ?? {});
writeDataSheet(
  productQueue,
  productHeaders,
  data.product_queue.map((row) => productHeaders.map((header) =>
    header === "source_product_code" && row[header] ? `\u200B${row[header]}` : row[header]
  )),
  [12, 22, 14, 16, 20, 14, 14, 20, 26, 18, 34, 36, 30, 18, 38, 16, 20],
);
if (data.product_queue.length > 0) {
  productQueue.getRange(`A2:B${data.product_queue.length + 1}`).format.numberFormat = "@";
  const candidateColumn = columnLetter(productHeaders.indexOf("candidate_sap_item_codes") + 1);
  const impactColumn = columnLetter(productHeaders.indexOf("impact_share") + 1);
  const cumulativeColumn = columnLetter(productHeaders.indexOf("cumulative_impact_share") + 1);
  const statusColumn = columnLetter(productHeaders.indexOf("mapping_status") + 1);
  productQueue.getRange(
    `${candidateColumn}2:${candidateColumn}${data.product_queue.length + 1}`,
  ).format.numberFormat = "@";
  productQueue.getRange(
    `${impactColumn}2:${cumulativeColumn}${data.product_queue.length + 1}`,
  ).format.numberFormat = "0.0%";
  productQueue.getRange(
    `${statusColumn}2:${statusColumn}${data.product_queue.length + 1}`,
  ).dataValidation = {
    rule: { type: "list", values: ["PENDING", "APPROVED", "REJECTED"] },
  };
  data.product_queue.forEach((row, index) => {
    if (row.candidate_basis === "EXACT_ITEM_MASTER_BARCODE") {
      productQueue.getRange(`J${index + 2}:O${index + 2}`).format = {
        fill: paleGreen,
        font: { bold: true, color: "#375623" },
      };
    } else if (row.candidate_basis === "UNIQUE_CROSS_SOURCE_OSCN") {
      productQueue.getRange(`J${index + 2}:O${index + 2}`).format = {
        fill: paleBlue,
        font: { bold: true, color: navy },
      };
    }
  });
}

const branchHeaders = Object.keys(data.branch_queue[0] ?? {});
writeDataSheet(
  branchQueue,
  branchHeaders,
  data.branch_queue.map((row) => branchHeaders.map((header) =>
    header === "branch_source_code" && row[header] ? `\u200B${row[header]}` : row[header]
  )),
  [12, 20, 28, 28, 28, 16, 14, 14, 20, 26, 22, 38, 16, 28, 16, 20],
);
if (data.branch_queue.length > 0) {
  branchQueue.getRange(`A2:C${data.branch_queue.length + 1}`).format.numberFormat = "@";
  const candidateColumn = columnLetter(branchHeaders.indexOf("candidate_card_code") + 1);
  const impactColumn = columnLetter(branchHeaders.indexOf("impact_share") + 1);
  const cumulativeColumn = columnLetter(branchHeaders.indexOf("cumulative_impact_share") + 1);
  const statusColumn = columnLetter(branchHeaders.indexOf("mapping_status") + 1);
  branchQueue.getRange(
    `${candidateColumn}2:${candidateColumn}${data.branch_queue.length + 1}`,
  ).format.numberFormat = "@";
  branchQueue.getRange(
    `${impactColumn}2:${cumulativeColumn}${data.branch_queue.length + 1}`,
  ).format.numberFormat = "0.0%";
  branchQueue.getRange(
    `${statusColumn}2:${statusColumn}${data.branch_queue.length + 1}`,
  ).dataValidation = {
    rule: { type: "list", values: ["PENDING", "APPROVED", "REJECTED"] },
  };
  const branchBasisColumn = columnLetter(branchHeaders.indexOf("candidate_basis") + 1);
  const matchingNameColumn = columnLetter(branchHeaders.indexOf("matching_name_used") + 1);
  data.branch_queue.forEach((row, index) => {
    if (row.candidate_basis === "SAME_CODE_NAME_ENRICHMENT") {
      branchQueue.getRange(
        `${matchingNameColumn}${index + 2}:${branchBasisColumn}${index + 2}`,
      ).format = {
        fill: paleBlue,
        font: { bold: true, color: navy },
      };
      branchQueue.getRange(
        `${candidateColumn}${index + 2}:${statusColumn}${index + 2}`,
      ).format.fill = paleBlue;
    }
  });
}

const publicationHeaders = Object.keys(data.publication_queue[0] ?? {});
writeDataSheet(
  publicationQueue,
  publicationHeaders,
  data.publication_queue.map((row) => publicationHeaders.map((header) => row[header])),
  [32, 12, 42, 24, 15, 22, 18, 16, 20, 22, 18, 20, 60, 16, 22],
);
if (data.publication_queue.length > 0) {
  publicationQueue.getRange(`A2:C${data.publication_queue.length + 1}`).format.numberFormat = "@";
  publicationQueue.getRange(`D2:D${data.publication_queue.length + 1}`).format.numberFormat =
    "yyyy-mm-dd hh:mm";
  publicationQueue.getRange(`K2:K${data.publication_queue.length + 1}`).format.numberFormat = "0.0%";
  publicationQueue.getRange(`M2:M${data.publication_queue.length + 1}`).format.wrapText = true;
  const statusColumn = columnLetter(publicationHeaders.indexOf("approval_status") + 1);
  publicationQueue.getRange(
    `${statusColumn}2:${statusColumn}${data.publication_queue.length + 1}`,
  ).dataValidation = {
    rule: { type: "list", values: ["PENDING", "APPROVED", "REJECTED"] },
  };
}

const tiers = [
  "P1_FIRST_50_PERCENT",
  "P2_NEXT_TO_80_PERCENT",
  "P3_NEXT_TO_95_PERCENT",
  "P4_REMAINDER",
];
const planRows = tiers.map((tier) => {
  const products = data.product_queue.filter((row) => row.priority_tier === tier);
  const branches = data.branch_queue.filter((row) => row.priority_tier === tier);
  return [
    tier,
    products.length,
    products.reduce((sum, row) => sum + Number(row.total_affected_rows || 0), 0),
    branches.length,
    branches.reduce((sum, row) => sum + Number(row.affected_rows || 0), 0),
    branches.filter((row) => row.recommendation === "HIGH_CONFIDENCE_CANDIDATE").length,
  ];
});
writeDataSheet(
  mappingPlan,
  [
    "Priority tier", "Product codes", "Product affected rows",
    "Branch identities", "Branch affected rows", "High-confidence branches",
  ],
  planRows,
  [28, 18, 24, 20, 22, 24],
);
mappingPlan.getRange("B2:F5").format.numberFormat = "#,##0";
const exactBarcodeProducts = data.product_queue.filter(
  (row) => row.candidate_basis === "EXACT_ITEM_MASTER_BARCODE",
);
const crossSourceProducts = data.product_queue.filter(
  (row) => row.candidate_basis === "UNIQUE_CROSS_SOURCE_OSCN",
);
const enrichedBranches = data.branch_queue.filter(
  (row) => row.candidate_basis === "SAME_CODE_NAME_ENRICHMENT"
    && row.recommendation === "HIGH_CONFIDENCE_CANDIDATE",
);
mappingPlan.getRange("A6:F6").merge();
mappingPlan.getRange("A6").values = [[
  `Exact Item Master barcode suggestions: ${exactBarcodeProducts.length} product code(s), `
  + `${exactBarcodeProducts.reduce(
    (sum, row) => sum + Number(row.total_affected_rows || 0), 0,
  ).toLocaleString("en-US")} affected row(s). `
  + `Unique cross-source OSCN suggestions: ${crossSourceProducts.length} product code(s), `
  + `${crossSourceProducts.reduce(
    (sum, row) => sum + Number(row.total_affected_rows || 0), 0,
  ).toLocaleString("en-US")} affected row(s). `
  + `Same-code branch-name suggestions: ${enrichedBranches.length} identity(ies), `
  + `${enrichedBranches.reduce(
    (sum, row) => sum + Number(row.affected_rows || 0), 0,
  ).toLocaleString("en-US")} affected row(s). Review only; nothing is auto-approved.`,
]];
mappingPlan.getRange("A6:F6").format = {
  fill: paleGreen,
  font: { bold: true, color: "#375623" },
  wrapText: true,
};
mappingPlan.getRange("A7:F7").merge();
mappingPlan.getRange("A7").values = [[
  "Action: filter Product Mapping / Branch Approval by priority_tier; approve only after evidence review.",
]];
mappingPlan.getRange("A7:F7").format = {
  fill: paleOrange,
  font: { bold: true, color: "#9C5700" },
  wrapText: true,
};
mappingPlan.getRange("A8:F8").merge();
mappingPlan.getRange("A8").values = [[
  `Candidate quality gate: ${data.candidate_quality.passed ? "PASS" : "FAIL"} — `
  + `${Number(data.candidate_quality.product_reviewable || 0).toLocaleString("en-US")} `
  + `reviewable product(s), `
  + `${Number(data.candidate_quality.branch_high_confidence || 0).toLocaleString("en-US")} `
  + `high-confidence branch(es), `
  + `${(data.candidate_quality.issues || []).length} issue(s).`,
]];
mappingPlan.getRange("A8:F8").format = {
  fill: data.candidate_quality.passed ? paleGreen : paleOrange,
  font: {
    bold: true,
    color: data.candidate_quality.passed ? "#375623" : "#9C5700",
  },
  wrapText: true,
};

dashboard.showGridLines = false;
dashboard.getRange("A1:L2").merge();
dashboard.getRange("A1").values = [["ESIP Daily Raw Preview"]];
dashboard.getRange("A1:L2").format = {
  fill: navy,
  font: { bold: true, color: "#FFFFFF", size: 20 },
  verticalAlignment: "center",
  horizontalAlignment: "left",
};
dashboard.getRange("A3:L3").merge();
dashboard.getRange("A3").values = [[
  "RECONCILED / NOT PUBLISHED — preview from PostgreSQL; branch approvals are still pending",
]];
dashboard.getRange("A3:L3").format = {
  fill: paleOrange,
  font: { bold: true, color: "#9C5700" },
};
dashboard.getRange("A4:L4").merge();
dashboard.getRange("A4").values = [[
  "Source note: DH Daily Raw sales supplies QTY only; DH sales amount is not included.",
]];
dashboard.getRange("A4:L4").format = {
  fill: "#FFF2CC",
  font: { italic: true, color: "#7F6000" },
};

const coverageEnd = data.coverage.length + 1;
const trendEnd = data.trend.length + 1;
dashboard.getRange("A5:C5").merge();
dashboard.getRange("D5:F5").merge();
dashboard.getRange("G5:I5").merge();
dashboard.getRange("J5:L5").merge();
dashboard.getRange("A5").values = [["Net Sales Amount"]];
dashboard.getRange("D5").values = [["Net Sales QTY"]];
dashboard.getRange("G5").values = [["Loaded Rows"]];
dashboard.getRange("J5").values = [["Mapping Rate"]];
dashboard.getRange("A6:C7").merge();
dashboard.getRange("D6:F7").merge();
dashboard.getRange("G6:I7").merge();
dashboard.getRange("J6:L7").merge();
dashboard.getRange("A6").formulas = [[`=SUM('Daily Trend'!C2:C${trendEnd})`]];
dashboard.getRange("D6").formulas = [[`=SUM('Daily Trend'!B2:B${trendEnd})`]];
dashboard.getRange("G6").formulas = [[`=SUM('Coverage'!C2:C${coverageEnd})`]];
dashboard.getRange("J6").formulas = [[
  `=SUM('Coverage'!C2:C${coverageEnd})/SUM('Coverage'!E2:E${coverageEnd})`,
]];
dashboard.getRange("A5:C7").format.fill = paleBlue;
dashboard.getRange("D5:F7").format.fill = paleGreen;
dashboard.getRange("G5:I7").format.fill = lightGray;
dashboard.getRange("J5:L7").format.fill = paleOrange;
dashboard.getRange("A5:L5").format.font = { bold: true, color: navy };
dashboard.getRange("A6:L7").format.font = { bold: true, size: 18, color: navy };
dashboard.getRange("A6").format.numberFormat = "#,##0.00";
dashboard.getRange("D6").format.numberFormat = "#,##0.00";
dashboard.getRange("G6").format.numberFormat = "#,##0";
dashboard.getRange("J6").format.numberFormat = "0.0%";

dashboard.getRange("A9:F9").merge();
dashboard.getRange("A9").values = [["Sales trend"]];
dashboard.getRange("G9:L9").merge();
dashboard.getRange("G9").values = [["Sales by source"]];
dashboard.getRange("A9:L9").format = {
  fill: blue, font: { bold: true, color: "#FFFFFF" },
};

if (data.trend.length > 0) {
  dashboard.getRange("N1:O1").values = [["Date", "Net Amount"]];
  dashboard.getRange(`N2:O${data.trend.length + 1}`).formulas =
    data.trend.map((_, index) => {
      const row = index + 2;
      return [`='Daily Trend'!A${row}`, `='Daily Trend'!C${row}`];
    });
  const trendChart = dashboard.charts.add(
    "line",
    dashboard.getRange(`N1:O${data.trend.length + 1}`),
  );
  trendChart.title = "Daily Net Sales Amount";
  trendChart.hasLegend = false;
  trendChart.setPosition("A10", "F25");
}

if (data.source_sales.length > 0) {
  dashboard.getRange("Q1:R1").values = [["Source", "Net Amount"]];
  dashboard.getRange(`Q2:R${data.source_sales.length + 1}`).formulas =
    data.source_sales.map((_, index) => {
      const rankingRow = index + 3;
      return [`='Rankings'!A${rankingRow}`, `='Rankings'!C${rankingRow}`];
    });
  const sourceChart = dashboard.charts.add(
    "bar",
    dashboard.getRange(`Q1:R${data.source_sales.length + 1}`),
  );
  sourceChart.title = "Net Sales by Source";
  sourceChart.hasLegend = false;
  sourceChart.setPosition("G10", "L25");
}

dashboard.getRange("A27:F27").merge();
dashboard.getRange("A27").values = [["Mapping coverage"]];
dashboard.getRange("A27:F27").format = {
  fill: blue, font: { bold: true, color: "#FFFFFF" },
};
dashboard.getRange("A28:F28").values = [[
  "Source", "Dataset", "Loaded", "Quarantined", "Total", "Rate",
]];
dashboard.getRange(`A29:F${28 + data.coverage.length}`).formulas =
  data.coverage.map((_, index) => {
    const row = index + 2;
    return [
      `='Coverage'!A${row}`, `='Coverage'!B${row}`, `='Coverage'!C${row}`,
      `='Coverage'!D${row}`, `='Coverage'!E${row}`, `='Coverage'!F${row}`,
    ];
  });
dashboard.getRange("A28:F28").format = {
  fill: lightGray, font: { bold: true, color: navy },
};
dashboard.getRange(`C29:E${28 + data.coverage.length}`).format.numberFormat = "#,##0";
dashboard.getRange(`F29:F${28 + data.coverage.length}`).format.numberFormat = "0.0%";

dashboard.getRange("G27:L27").merge();
dashboard.getRange("G27").values = [["Approval work queues"]];
dashboard.getRange("G27:L27").format = {
  fill: blue, font: { bold: true, color: "#FFFFFF" },
};
dashboard.getRange("G28:I28").merge();
dashboard.getRange("J28:L28").merge();
dashboard.getRange("G28").values = [["Product codes pending"]];
dashboard.getRange("J28").values = [["Branch identities pending"]];
dashboard.getRange("G29:I30").merge();
dashboard.getRange("J29:L30").merge();
dashboard.getRange("G29").values = [[data.product_queue.length]];
dashboard.getRange("J29").values = [[data.branch_queue.length]];
dashboard.getRange("G28:L28").format = {
  fill: lightGray, font: { bold: true, color: navy },
};
dashboard.getRange("G29:L30").format = {
  fill: paleOrange, font: { bold: true, size: 18, color: navy },
};
dashboard.getRange("G29").format.numberFormat = "#,##0";
dashboard.getRange("J29").format.numberFormat = "#,##0";

const publicationReady = data.publication_queue.filter(
  (row) => row.readiness_status === "READY_FOR_APPROVAL",
).length;
const publicationBlocked = data.publication_queue.length - publicationReady;
dashboard.getRange("G32:L32").merge();
dashboard.getRange("G32").values = [["Publication readiness (governance only; nothing is auto-published)"]];
dashboard.getRange("G32:L32").format = {
  fill: blue, font: { bold: true, color: "#FFFFFF" },
};
dashboard.getRange("G33:I33").merge();
dashboard.getRange("J33:L33").merge();
dashboard.getRange("G33").values = [["Ready for approval"]];
dashboard.getRange("J33").values = [["Blocked"]];
dashboard.getRange("G34:I35").merge();
dashboard.getRange("J34:L35").merge();
dashboard.getRange("G34").values = [[publicationReady]];
dashboard.getRange("J34").values = [[publicationBlocked]];
dashboard.getRange("G33:L33").format = {
  fill: lightGray, font: { bold: true, color: navy },
};
dashboard.getRange("G34:I35").format = {
  fill: paleGreen, font: { bold: true, size: 18, color: navy },
};
dashboard.getRange("J34:L35").format = {
  fill: paleOrange, font: { bold: true, size: 18, color: navy },
};

dashboard.getRange("A:L").format.columnWidth = 14;
dashboard.getRange("A:A").format.columnWidth = 18;
dashboard.getRange("B:B").format.columnWidth = 18;
dashboard.freezePanes.freezeRows(3);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
if (errors.ndjson.includes('"kind":"match"')) {
  throw new Error(`Formula errors found: ${errors.ndjson}`);
}

await fs.mkdir(outputPath.substring(0, outputPath.lastIndexOf("\\")), { recursive: true });
const preview = await workbook.render({
  sheetName: "Dashboard",
  range: `A1:L${30 + data.coverage.length}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const visualPassDir = `${previewPath}.sheets`;
const firstCrossSourceProductIndex = data.product_queue.findIndex(
  (row) => row.candidate_basis === "UNIQUE_CROSS_SOURCE_OSCN",
);
const productQaStart = firstCrossSourceProductIndex >= 0
  ? Math.max(1, firstCrossSourceProductIndex)
  : 1;
const productQaEnd = Math.min(data.product_queue.length + 1, productQaStart + 11);
const firstEnrichedBranchIndex = data.branch_queue.findIndex(
  (row) => row.candidate_basis === "SAME_CODE_NAME_ENRICHMENT",
);
const branchQaStart = firstEnrichedBranchIndex >= 0
  ? Math.max(1, firstEnrichedBranchIndex)
  : 1;
const branchQaEnd = Math.min(data.branch_queue.length + 1, branchQaStart + 11);
const visualRanges = {
  Dashboard: `A1:L${30 + data.coverage.length}`,
  "Daily Action List": `A1:F${actionRows.length + 1}`,
  Coverage: `A1:F${Math.min(data.coverage.length + 1, 40)}`,
  "Input Freshness": `A1:I${data.freshness.length + 1}`,
  "Input File Safety": `A1:K${data.input_safety.length + 1}`,
  "Manual Report Coverage": `A1:F${manualCoverageRows.length + 1}`,
  "Batch History": `A1:I${Math.min(data.batches.length + 1, 30)}`,
  "Daily Trend": `A1:C${Math.min(data.trend.length + 1, 40)}`,
  Rankings: `A1:D${Math.min(rankingRows.length, 70)}`,
  Quarantine: `A1:D${Math.min(data.quarantine.length + 1, 40)}`,
  "Product Mapping": `A${productQaStart}:Q${productQaEnd}`,
  "Branch Approval": `A${branchQaStart}:P${branchQaEnd}`,
  "Publication Readiness": `A1:O${Math.min(data.publication_queue.length + 1, 30)}`,
  "Mapping Action Plan": "A1:F8",
  "Approval Instructions": "A1:B10",
};
if (qaAllSheets) {
  await fs.mkdir(visualPassDir, { recursive: true });
  for (const [sheetName, range] of Object.entries(visualRanges)) {
    const sheetPreview = await workbook.render({
      sheetName,
      range,
      scale: 0.8,
      format: "png",
    });
    const safeName = sheetName.replaceAll(" ", "_");
    await fs.writeFile(
      `${visualPassDir}/${safeName}.png`,
      new Uint8Array(await sheetPreview.arrayBuffer()),
    );
  }
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
