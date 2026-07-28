"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMINISTRATOR" | "SALE_ADMIN" | "USER";
type PageId = "dashboard" | "reports" | "simulations" | "imports" | "confirm" | "sources" | "audit" | "authorize";
type Theme = "dark" | "light";

type Confirmation = {
  id: string | number;
  queue_kind?: "PRODUCT" | "BRANCH";
  category: string;
  source_code: string;
  subject: string;
  candidate: string;
  evidence: string;
  priority: string;
  affected_rows: number;
  status: string;
};

type AuditEvent = {
  id: string | number;
  action: string;
  actor_email: string;
  detail: string;
  created_at: string;
};

type ApiPayload = {
  confirmations: Confirmation[];
  audit: AuditEvent[];
  canConfirm: boolean;
  role: Role;
  mode: "LOCAL_TRIAL" | "PRIVATE_SITE" | "ANONYMOUS";
  user: { displayName: string; email: string } | null;
  error?: string;
};

type DashboardData = {
  coverage: {
    first_date: string | null;
    last_date: string | null;
    available_days: number;
    sales_rows: number;
    sales_qty: number;
    sales_amount: number;
  };
  trend: Array<{ sales_date: string; net_qty: number; net_amount: number }>;
  source_sales: Array<{
    source_code: string;
    first_date: string;
    last_date: string;
    available_days: number;
    net_qty: number;
    net_amount: number;
  }>;
  top_branches: Array<{
    source_code: string;
    branch_source_name: string;
    net_qty: number;
    net_amount: number;
  }>;
  top_products: Array<{
    sap_item_code: string;
    source_sku: string;
    net_qty: number;
    net_amount: number;
  }>;
  inventory: Array<{
    source_code: string;
    snapshot_date: string;
    onhand_qty: number;
    onhand_value: number;
  }>;
  source_status?: Array<{
    source_code: string;
    source_name: string;
    enabled: boolean;
    latest_sales_date: string | null;
    sales_days_behind: number | null;
    sales_status: string;
    latest_inventory_date: string | null;
    inventory_days_behind: number | null;
    inventory_status: string;
  }>;
  data_quality: Array<{ source_code: string; issue: string; affected_rows: number }>;
  reference_coverage: Array<{ report: string; status: string; note: string }>;
  approval_queue_total?: number;
  publication_queue_total?: number;
  generated_at?: string;
};

type UserRow = {
  email: string;
  username: string;
  role: Role;
  display_name: string;
  department: string;
  job_title: string;
  auth_source: "LOCAL" | "ACTIVE_DIRECTORY";
  status: "ACTIVE" | "SUSPENDED";
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};
type UserDraft = Pick<UserRow, "email" | "username" | "role" | "display_name" | "department" | "job_title" | "auth_source" | "status">;
type UserAdminEvent = {
  id: number;
  action: string;
  actor_email: string;
  detail: string;
  created_at: string;
};
type SimulationAxis = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
};
type ModuleCard = {
  number: string;
  title: string;
  status: string;
  detail: string;
  values: number[];
  labels: string[];
  value: string;
  sub: string;
  xAxis: string;
  yAxis: string;
  unit: string;
  simulationAxes: SimulationAxis[];
};
type PermissionMatrix = Record<Role, Record<PageId, boolean>>;
type ImportFile = { source: string; filename: string; size: number; modified_at: string; pending: boolean };
type ImportEvent = { run_id: string; trigger: string; actor: string; status: string; started_at?: string; finished_at?: string; source?: string; filename?: string; detail?: string };
type ImportCenterData = {
  pending_files: ImportFile[];
  history: ImportEvent[];
  scheduler: { enabled: boolean; time: string; timezone: string; last_scheduled_date: string | null; telegram_configured: boolean; running: boolean };
  sources: string[];
};

const nav: Array<[PageId, string]> = [
  ["dashboard", "ภาพรวม"],
  ["reports", "รายงาน Sale Out"],
  ["simulations", "Simulation Lab"],
  ["imports", "นำเข้าข้อมูล"],
  ["confirm", "Admin Confirm"],
  ["sources", "แหล่งข้อมูล"],
  ["audit", "Audit Log"],
  ["authorize", "Authorize Matrix"],
];

const roleLabels: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  SALE_ADMIN: "Sale Admin",
  USER: "User",
};

const sourceNames: Record<string, string> = {
  DH: "DoHome",
  GBH: "Global House",
  HH: "HomeHub",
  HP: "HomePro",
  MH: "Mega Home",
  HP_MH: "HomePro / Mega Home",
  TWD: "Thai Watsadu",
  TA: "Thai Aus",
};

const evidenceLabels: Record<string, string> = {
  EXACT_ITEM_MASTER_BARCODE: "Barcode ตรงกับ Item Master ของ SAP",
  UNIQUE_CROSS_SOURCE_OSCN: "พบรหัส OSCN ที่ตรงกันเพียงรายการเดียวจากแหล่งอื่น",
  EXACT_OSCN: "รหัสตรงกับข้อมูล OSCN",
  EXACT_BRANCH_CODE: "รหัสสาขาตรงกับ Branch Master",
  NAME_MATCH: "ชื่อสาขาตรงหรือใกล้เคียงกับ Branch Master",
  SOURCE_BRANCH_NAME: "ระบบเทียบจากชื่อสาขาที่อยู่ในไฟล์ต้นทาง",
};

const priorityLabels: Record<string, string> = {
  P1: "สำคัญมาก",
  P2: "ควรตรวจ",
  P3: "ตรวจตามลำดับ",
  P4: "ข้อมูลประกอบ",
};

const rawSourcePaths = [
  { code: "DH", name: "DoHome", local: "D:\\Python\\ESIP\\SourceFiles\\DH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\DH" },
  { code: "GBH", name: "Global House", local: "D:\\Python\\ESIP\\SourceFiles\\GBH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\GBH" },
  { code: "HH", name: "HomeHub", local: "D:\\Python\\ESIP\\SourceFiles\\HH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\HomeHub" },
  { code: "HP", name: "HomePro", local: "D:\\Python\\ESIP\\SourceFiles\\HP_MH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\HP_MH" },
  { code: "MH", name: "Mega Home", local: "D:\\Python\\ESIP\\SourceFiles\\HP_MH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\HP_MH" },
  { code: "TWD", name: "Thai Watsadu", local: "D:\\Python\\ESIP\\SourceFiles\\TWD\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\TWD" },
  { code: "TA", name: "Thai Aus", local: "D:\\Python\\ESIP\\SourceFiles\\TA\\incoming", nas: "รอเปิดใช้งานเมื่อมี Daily Raw ชุดแรก" },
];

const defaultPermissions: PermissionMatrix = {
  ADMINISTRATOR: {
    dashboard: true,
    reports: true,
    simulations: true,
    imports: true,
    confirm: true,
    sources: true,
    audit: true,
    authorize: true,
  },
  SALE_ADMIN: {
    dashboard: true,
    reports: true,
    simulations: true,
    imports: true,
    confirm: true,
    sources: true,
    audit: true,
    authorize: false,
  },
  USER: {
    dashboard: true,
    reports: true,
    simulations: false,
    imports: false,
    confirm: false,
    sources: true,
    audit: false,
    authorize: false,
  },
};

const money = (value: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(value || 0);

async function readJsonResponse<T>(response: Response, serviceName: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${serviceName} ตอบกลับผิดรูปแบบ กรุณาตรวจสอบว่า API ทำงานอยู่`);
  }
  return (await response.json()) as T;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`API ใช้เวลาตอบกลับเกิน ${Math.round(timeoutMs / 1000)} วินาที`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

const emptyUserDraft: UserDraft = {
  email: "",
  username: "",
  role: "USER",
  display_name: "",
  department: "",
  job_title: "",
  auth_source: "ACTIVE_DIRECTORY",
  status: "ACTIVE",
};

export default function EsipApp() {
  const [active, setActive] = useState<PageId>("dashboard");
  const [auth, setAuth] = useState<ApiPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [queue, setQueue] = useState<Confirmation[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [localRole, setLocalRole] = useState<Role>("ADMINISTRATOR");
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("esip-theme") === "light"
      ? "light"
      : "dark",
  );
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | number | null>(null);
  const [reference, setReference] = useState<Record<string, string>>({});
  const [editingCandidate, setEditingCandidate] = useState<Record<string, boolean>>({});
  const [overrideCandidate, setOverrideCandidate] = useState<Record<string, string>>({});
  const [masterSuggestions, setMasterSuggestions] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [message, setMessage] = useState("");
  const [queueType, setQueueType] = useState<"all" | "product" | "branch">("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [queueTotal, setQueueTotal] = useState(0);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userEvents, setUserEvents] = useState<UserAdminEvent[]>([]);
  const [permissions, setPermissions] = useState<PermissionMatrix>(defaultPermissions);
  const [draftPermissions, setDraftPermissions] = useState<PermissionMatrix>(defaultPermissions);
  const [permissionsDirty, setPermissionsDirty] = useState(false);
  const [userDraft, setUserDraft] = useState<UserDraft>(emptyUserDraft);
  const [editingUser, setEditingUser] = useState<UserDraft | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"ALL" | UserRow["status"]>("ALL");
  const [imports, setImports] = useState<ImportCenterData | null>(null);
  const [importSource, setImportSource] = useState("AUTO");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [importWorking, setImportWorking] = useState(false);
  const [priceLift, setPriceLift] = useState(0.5);
  const [cogsLift, setCogsLift] = useState(2);
  const [volumeLift, setVolumeLift] = useState(0);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const bridgeHeaders = {
    "content-type": "application/json",
    authorization: "Bearer esip-local-apply-token",
  };

  const loadDashboardData = useCallback(async () => {
    const dataResponse = await fetchWithTimeout("http://localhost:8090/data", { cache: "no-store" });
    const dashboardPayload = await readJsonResponse<DashboardData & { error?: string }>(dataResponse, "Dashboard API");
    if (!dataResponse.ok) throw new Error(dashboardPayload.error ?? "โหลดข้อมูลรายงานไม่ได้");
    setDashboard(dashboardPayload);
    if (typeof dashboardPayload.approval_queue_total === "number") {
      setQueueTotal(dashboardPayload.approval_queue_total);
    }
  }, []);

  const loadQueueData = useCallback(async () => {
    const query = new URLSearchParams({
      type: queueType,
      limit: "200",
      search: queueSearch,
    });
    const [queueResponse, auditResponse] = await Promise.all([
      fetch(`http://localhost:8090/queue?${query}`, { cache: "no-store" }),
      fetch("http://localhost:8090/audit", { cache: "no-store" }),
    ]);
    const queuePayload = await readJsonResponse<{
      items?: Confirmation[];
      total?: number;
      error?: string;
    }>(queueResponse, "Queue API");
    const auditPayload = await readJsonResponse<{
      events?: AuditEvent[];
      error?: string;
    }>(auditResponse, "Audit API");
    if (!queueResponse.ok) throw new Error(queuePayload.error ?? "โหลดคิวไม่ได้");
    setQueue(queuePayload.items ?? []);
    setQueueTotal(queuePayload.total ?? 0);
    setAudit(auditPayload.events ?? []);
  }, [queueSearch, queueType]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, [theme]);

  useEffect(() => {
    fetch("/api/confirmations", {
      cache: "no-store",
      headers: { "x-esip-local-role": localRole },
    })
      .then(async (response) => readJsonResponse<ApiPayload>(response, "Authorization API"))
      .then(async (payload) => {
        setAuth(payload);
        if (payload.mode === "LOCAL_TRIAL") {
          await loadDashboardData();
        } else {
          setQueue(payload.confirmations ?? []);
          setAudit(payload.audit ?? []);
        }
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "โหลดข้อมูล ESIP ไม่ได้"),
      )
      .finally(() => setLoading(false));
  }, [loadDashboardData, localRole]);

  useEffect(() => {
    if (auth?.mode !== "LOCAL_TRIAL") return;
    if (active !== "confirm" && active !== "audit") return;
    const timer = window.setTimeout(() => {
      loadQueueData().catch((error) =>
        setMessage(error instanceof Error ? error.message : "โหลดคิวไม่สำเร็จ"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, auth?.mode, loadQueueData]);

  useEffect(() => {
    if (auth?.role !== "ADMINISTRATOR") return;
    fetch("/api/users", { headers: { "x-esip-local-role": localRole } })
      .then(async (response) => {
        const payload = (await response.json()) as { users?: UserRow[]; events?: UserAdminEvent[] };
        if (response.ok) {
          setUsers(payload.users ?? []);
          setUserEvents(payload.events ?? []);
        }
      })
      .catch(() => undefined);
  }, [auth?.role, localRole]);

  useEffect(() => {
    if (!auth) return;
    fetch("/api/permissions", { headers: { "x-esip-local-role": localRole } })
      .then(async (response) => {
        const payload = (await response.json()) as { permissions?: PermissionMatrix };
        if (response.ok && payload.permissions) {
          setPermissions(payload.permissions);
          setDraftPermissions(payload.permissions);
          setPermissionsDirty(false);
        }
      })
      .catch(() => undefined);
  }, [auth, localRole]);

  const visibleNav = useMemo(
    () =>
      nav.filter(([id]) => {
        const role = auth?.role ?? "USER";
        if (id === "confirm" && !auth?.canConfirm) return false;
        return Boolean(permissions[role]?.[id]);
      }),
    [auth?.canConfirm, auth?.role, permissions],
  );

  useEffect(() => {
    const role = auth?.role ?? "USER";
    if (!permissions[role]?.[active]) {
      const fallback = nav.find(([id]) => permissions[role]?.[id])?.[0] ?? "dashboard";
      const timer = window.setTimeout(() => setActive(fallback), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [active, auth?.role, permissions]);

  const loadImports = useCallback(async () => {
    const response = await fetchWithTimeout("http://localhost:8090/imports", { cache: "no-store" }, 15000);
    const payload = await readJsonResponse<ImportCenterData & { error?: string }>(response, "Import Status API");
    if (!response.ok) throw new Error(payload.error ?? "โหลดข้อมูล Import Center ไม่ได้");
    setImports(payload);
  }, []);

  useEffect(() => {
    if ((active === "imports" || active === "sources") && auth?.role !== "USER") {
      const timer = window.setTimeout(() => {
        loadImports().catch((error) => setMessage(error instanceof Error ? error.message : "โหลด Import Center ไม่ได้"));
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [active, auth?.role, loadImports]);

  async function processImports(trigger = "MANUAL_FOLDER") {
    setImportWorking(true);
    try {
      const response = await fetch("http://localhost:8090/process", {
        method: "POST",
        headers: { ...bridgeHeaders, "x-esip-role": auth?.role ?? "USER" },
        body: JSON.stringify({ trigger, actor: auth?.user?.email ?? "" }),
      });
      const payload = (await response.json()) as { status?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Process ไม่สำเร็จ");
      await Promise.all([loadImports(), loadDashboardData(), loadQueueData()]);
      setMessage(payload.status === "PASS" ? "Process ข้อมูลสำเร็จ Dashboard อัปเดตแล้ว" : "Process หยุดเพราะพบข้อผิดพลาด กรุณาดูประวัติด้านล่าง");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Process ไม่สำเร็จ");
    } finally {
      setImportWorking(false);
    }
  }

  async function uploadAndProcess(processImmediately: boolean) {
    if (uploadFiles.length === 0) {
      setMessage("กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์");
      return;
    }
    setImportWorking(true);
    setMessage("");
    const fileCount = uploadFiles.length;
    try {
      for (const file of uploadFiles) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("http://localhost:8090/upload", {
          method: "POST",
          headers: {
            authorization: "Bearer esip-local-apply-token",
            "x-esip-role": auth?.role ?? "USER",
            "x-esip-actor": auth?.user?.email ?? "",
            "x-esip-source": importSource,
          },
          body: form,
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? `Upload ${file.name} ไม่สำเร็จ`);
      }
      setUploadFiles([]);
      if (processImmediately) {
        setImportWorking(false);
        await processImports("UPLOAD_AND_PROCESS");
      } else {
        await loadImports();
        setMessage(`นำ ${fileCount} ไฟล์ไปวางในพื้นที่รอประมวลผลแล้ว`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "นำเข้าไฟล์ไม่สำเร็จ");
    } finally {
      setImportWorking(false);
    }
  }

  function switchTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("esip-theme", next);
  }

  async function decide(item: Confirmation, decision: "APPROVED" | "REJECTED") {
    const approvalReference = reference[String(item.id)]?.trim() ?? "";
    if (approvalReference.length < 3) {
      setMessage("กรุณากรอก Approval Reference ก่อน");
      return;
    }
    setWorking(item.id);
    setMessage("");
    try {
      if (auth?.mode === "LOCAL_TRIAL") {
        const response = await fetch(
          decision === "APPROVED"
            ? "http://localhost:8090/apply"
            : "http://localhost:8090/reject",
          {
            method: "POST",
            headers: bridgeHeaders,
            body: JSON.stringify({
              confirmation: item,
              reference: approvalReference,
              actor: auth.user?.email,
              role: auth.role,
              override_candidate: overrideCandidate[String(item.id)]?.trim() || undefined,
            }),
          },
        );
        const payload = (await response.json()) as { message?: string; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "ดำเนินการไม่สำเร็จ");
        await loadQueueData();
        setMessage(payload.message ?? "บันทึกเรียบร้อย");
      } else {
        const response = await fetch("/api/confirmations", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-esip-local-role": localRole,
          },
          body: JSON.stringify({
            id: item.id,
            decision,
            reference: approvalReference,
          }),
        });
        const payload = (await response.json()) as ApiPayload;
        if (!response.ok) throw new Error(payload.error ?? "ดำเนินการไม่สำเร็จ");
        setAuth(payload);
        setQueue(payload.confirmations);
        setAudit(payload.audit);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setWorking(null);
    }
  }

  async function searchMaster(item: Confirmation, value: string) {
    if (value.trim().length < 2) {
      setMasterSuggestions((old) => ({ ...old, [String(item.id)]: [] }));
      return;
    }
    const query = new URLSearchParams({
      kind: item.queue_kind === "BRANCH" ? "branch" : "product",
      q: value.trim(),
    });
    const response = await fetch(`http://localhost:8090/master-search?${query}`, { cache: "no-store" });
    const payload = (await response.json()) as { items?: Array<{ code: string; name: string }> };
    setMasterSuggestions((old) => ({ ...old, [String(item.id)]: payload.items ?? [] }));
  }

  async function saveUser(draft = userDraft) {
    const email = draft.email.trim().toLowerCase();
    if (!email.includes("@")) {
      setMessage("กรุณากรอกอีเมลให้ถูกต้อง");
      return;
    }
    await saveUserProfile({ ...draft, email });
    setUserDraft(emptyUserDraft);
    setEditingUser(null);
  }

  async function saveUserProfile(draft: UserDraft) {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-esip-local-role": localRole,
      },
      body: JSON.stringify(draft),
    });
    const payload = (await response.json()) as { users?: UserRow[]; events?: UserAdminEvent[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "บันทึก Role ไม่สำเร็จ");
      return;
    }
    setUsers(payload.users ?? []);
    setUserEvents(payload.events ?? []);
    setMessage("บันทึกข้อมูลผู้ใช้แล้ว");
  }

  async function manageUserAccess(email: string, action: "ACTIVATE" | "SUSPEND" | "UNLOCK") {
    if (action === "SUSPEND" && !window.confirm(`ยืนยันระงับการใช้งาน ${email}?`)) return;
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-esip-local-role": localRole,
      },
      body: JSON.stringify({ email, action }),
    });
    const payload = (await response.json()) as {
      users?: UserRow[];
      events?: UserAdminEvent[];
      error?: string;
    };
    if (!response.ok) {
      setMessage(payload.error ?? "จัดการสถานะผู้ใช้ไม่สำเร็จ");
      return;
    }
    setUsers(payload.users ?? []);
    setUserEvents(payload.events ?? []);
    setMessage(
      action === "UNLOCK"
        ? "ปลดล็อกบัญชีและล้างจำนวนครั้งที่เข้าสู่ระบบผิดแล้ว"
        : action === "SUSPEND"
          ? "ระงับบัญชีผู้ใช้แล้ว"
          : "เปิดใช้งานบัญชีผู้ใช้แล้ว",
    );
  }

  function savePermission(role: Role, menuId: PageId, canView: boolean) {
    const next = {
      ...draftPermissions,
      [role]: { ...draftPermissions[role], [menuId]: canView },
    };
    setDraftPermissions(next);
    setPermissionsDirty(true);
  }

  async function savePermissionMatrix() {
    const updates: Array<Promise<Response>> = [];
    for (const role of ["ADMINISTRATOR", "SALE_ADMIN", "USER"] as const) {
      for (const [menuId] of nav) {
        if (permissions[role]?.[menuId] === draftPermissions[role]?.[menuId]) continue;
        updates.push(fetch("/api/permissions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-esip-local-role": localRole,
          },
          body: JSON.stringify({ role, menuId, canView: draftPermissions[role][menuId] }),
        }));
      }
    }
    const responses = await Promise.all(updates);
    const failed = responses.find((response) => !response.ok);
    if (failed) {
      const payload = (await failed.json()) as { error?: string };
      setMessage(payload.error ?? "บันทึกสิทธิ์ไม่สำเร็จ");
      return;
    }
    const response = await fetch("/api/permissions", { headers: { "x-esip-local-role": localRole } });
    const payload = (await response.json()) as { permissions?: PermissionMatrix };
    if (response.ok && payload.permissions) {
      setPermissions(payload.permissions);
      setDraftPermissions(payload.permissions);
      setPermissionsDirty(false);
    }
    setMessage(updates.length > 0 ? "บันทึกสิทธิ์เมนูแล้ว" : "ไม่มีรายการเปลี่ยนแปลง");
  }

  function resetPermissionMatrix() {
    setDraftPermissions(permissions);
    setPermissionsDirty(false);
    setMessage("ยกเลิกการเปลี่ยนแปลงสิทธิ์แล้ว");
  }

  const trend = dashboard?.trend ?? [];
  const coverage = dashboard?.coverage;
  const sourceSales = dashboard?.source_sales ?? [];
  const sourceMax = Math.max(...sourceSales.map((row) => Number(row.net_amount) || 0), 1);
  const inventoryTotal = (dashboard?.inventory ?? []).reduce((sum, row) => sum + Number(row.onhand_qty || 0), 0);
  const latestDay = trend.at(-1);
  const previousDay = trend.at(-2);
  const dailyChange = previousDay?.net_amount
    ? ((Number(latestDay?.net_amount || 0) - Number(previousDay.net_amount)) / Math.abs(Number(previousDay.net_amount))) * 100
    : null;
  const simulation = useMemo(() => {
    const revenue = Number(coverage?.sales_amount ?? 0);
    const quantity = Number(coverage?.sales_qty ?? 0);
    const baselineCogs = revenue * 0.72;
    const simulatedRevenue = revenue * (1 + priceLift / 100) * (1 + volumeLift / 100);
    const simulatedCogs = baselineCogs * (1 + cogsLift / 100) * (1 + volumeLift / 100);
    const baselineGp = revenue - baselineCogs;
    const simulatedGp = simulatedRevenue - simulatedCogs;
    return {
      revenue,
      quantity,
      simulatedRevenue,
      simulatedGp,
      revenueDelta: simulatedRevenue - revenue,
      gpDelta: simulatedGp - baselineGp,
      margin: simulatedRevenue ? (simulatedGp / simulatedRevenue) * 100 : 0,
    };
  }, [cogsLift, coverage?.sales_amount, coverage?.sales_qty, priceLift, volumeLift]);
  const recentTrend = trend.slice(-12).map((row) => Number(row.net_amount) || 0);
  const recentTrendLabels = trend.slice(-12).map((row) => row.sales_date);
  const productValues = (dashboard?.top_products ?? []).slice(0, 8).map((row) => Number(row.net_amount) || 0);
  const productLabels = (dashboard?.top_products ?? []).slice(0, 8).map((row) => row.sap_item_code || row.source_sku);
  const branchValues = (dashboard?.top_branches ?? []).slice(0, 8).map((row) => Number(row.net_amount) || 0);
  const branchLabels = (dashboard?.top_branches ?? []).slice(0, 8).map((row) => row.branch_source_name);
  const inventoryValues = (dashboard?.inventory ?? []).map((row) => Number(row.onhand_qty) || 0);
  const inventoryLabels = (dashboard?.inventory ?? []).map((row) => `${row.source_code} ${row.snapshot_date}`);
  const pctAxis = (key: string, label: string, min = -20, max = 20, step = 0.5): SimulationAxis => ({
    key, label, min, max, step, unit: "%", defaultValue: 0,
  });
  const moduleCards: ModuleCard[] = [
    { number: "01", title: "Executive Summary", status: "LIVE", detail: `${money(coverage?.sales_amount ?? 0)} sales`, values: recentTrend, labels: recentTrendLabels, value: money(latestDay?.net_amount ?? 0), sub: latestDay?.sales_date ?? "รอข้อมูล", xAxis: "วันที่ขาย", yAxis: "ยอดขายสุทธิ", unit: "บาท", simulationAxes: [pctAxis("price", "ราคาขาย"), pctAxis("volume", "จำนวนขาย"), pctAxis("coverage", "MT coverage", -30, 30, 1)] },
    { number: "02", title: "Sales Performance", status: "LIVE", detail: "แนวโน้มยอดขายรายวัน / MTD และเปรียบเทียบ MT", values: recentTrend, labels: recentTrendLabels, value: `${trend.length} วัน`, sub: `${dailyChange === null ? "N/A" : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(1)}%`} เทียบวันก่อน`, xAxis: "วันที่ขาย", yAxis: "ยอดขายสุทธิ", unit: "บาท", simulationAxes: [pctAxis("price", "ราคาขาย"), pctAxis("volume", "จำนวนขาย"), pctAxis("seasonality", "Seasonality", -30, 30, 1), pctAxis("promotion", "Promotion uplift", 0, 40, 1)] },
    { number: "03", title: "Product Intelligence", status: "LIVE", detail: "Top SKU, Product Mix และ Product Mapping", values: productValues, labels: productLabels, value: money(dashboard?.top_products?.[0]?.net_amount ?? 0), sub: dashboard?.top_products?.[0]?.sap_item_code ?? "Top SKU", xAxis: "สินค้า (SAP Item Code)", yAxis: "ยอดขายสุทธิ", unit: "บาท", simulationAxes: [pctAxis("price", "ราคาขาย"), pctAxis("mix", "Product mix"), pctAxis("promotion", "Promotion uplift", 0, 40, 1), pctAxis("availability", "สินค้าไม่ขาดสต็อก", 0, 25, 1)] },
    { number: "04", title: "Branch Intelligence", status: "LIVE", detail: "ผลงานและอันดับสาขา", values: branchValues, labels: branchLabels, value: money(dashboard?.top_branches?.[0]?.net_amount ?? 0), sub: dashboard?.top_branches?.[0]?.branch_source_name ?? "Top branch", xAxis: "สาขา", yAxis: "ยอดขายสุทธิ", unit: "บาท", simulationAxes: [pctAxis("traffic", "จำนวนลูกค้า"), pctAxis("conversion", "Conversion rate"), pctAxis("basket", "Basket size"), pctAxis("coverage", "จำนวนสาขาที่ขาย", -30, 30, 1)] },
    { number: "05", title: "Inventory Control", status: "LIVE", detail: "On Hand, Stock Value และความสดใหม่ของ Snapshot", values: inventoryValues, labels: inventoryLabels, value: money(inventoryTotal), sub: `${dashboard?.inventory?.length ?? 0} MT snapshots`, xAxis: "MT / วันที่ Snapshot", yAxis: "จำนวน On Hand", unit: "ชิ้น", simulationAxes: [pctAxis("demand", "Demand"), pctAxis("safety", "Safety stock", -50, 100, 1), pctAxis("leadtime", "Lead time", -30, 60, 1), pctAxis("shrinkage", "Shrinkage", 0, 10, 0.1)] },
    { number: "06", title: "Target Achievement", status: "SIM", detail: "ยอดจริง เป้าหมาย Gap และ %Achievement", values: recentTrend.map((value) => value * (1 + priceLift / 100)), labels: recentTrendLabels, value: `${(100 + priceLift + volumeLift).toFixed(1)}%`, sub: "แบบจำลองเป้าหมาย", xAxis: "วันที่ขาย", yAxis: "ยอดขายเทียบเป้าหมาย", unit: "บาท", simulationAxes: [pctAxis("target", "เป้าหมาย"), pctAxis("price", "ราคาขาย"), pctAxis("volume", "จำนวนขาย"), pctAxis("workingDays", "จำนวนวันขาย", -20, 20, 1)] },
    { number: "07", title: "Forecast & Run Rate", status: "SIM", detail: "ประมาณการสิ้นเดือนและแนวโน้ม Run Rate", values: recentTrend.map((value) => value * (1 + volumeLift / 100)), labels: recentTrendLabels, value: money((latestDay?.net_amount ?? 0) * 30), sub: "Latest-day run rate", xAxis: "วันที่ขาย", yAxis: "ยอดขายคาดการณ์", unit: "บาท", simulationAxes: [pctAxis("trend", "Trend"), pctAxis("seasonality", "Seasonality", -30, 30, 1), pctAxis("promotion", "Promotion uplift", 0, 40, 1), pctAxis("risk", "Forecast risk", -30, 0, 1)] },
    { number: "08", title: "Gross Profit", status: "SIM", detail: "GP, Margin และสมมติฐาน COGS", values: recentTrend.map((value) => value * (0.28 - cogsLift / 100)), labels: recentTrendLabels, value: `${simulation.margin.toFixed(1)}%`, sub: `${money(simulation.simulatedGp)} GP`, xAxis: "วันที่ขาย", yAxis: "กำไรขั้นต้น", unit: "บาท", simulationAxes: [pctAxis("price", "ราคาขาย"), pctAxis("volume", "จำนวนขาย"), pctAxis("cogs", "COGS"), pctAxis("discount", "ส่วนลด", 0, 20, 0.5)] },
    { number: "09", title: "YoY Comparison", status: "LIVE", detail: "เปรียบเทียบช่วงเวลาเดียวกันระหว่างปี", values: recentTrend, labels: recentTrendLabels, value: coverage?.first_date?.startsWith("2025") ? "READY" : "WAIT", sub: "ประวัติข้อมูลเริ่มปี 2025", xAxis: "วันที่ขาย", yAxis: "ยอดขายสุทธิ", unit: "บาท", simulationAxes: [pctAxis("growth", "Growth"), pctAxis("calendar", "ผลต่างวันทำการ", -20, 20, 1), pctAxis("price", "ราคาขาย"), pctAxis("volume", "จำนวนขาย")] },
    { number: "10", title: "Stock Aging", status: "SIM", detail: "Aging bucket และ Slow-moving proxy", values: inventoryValues.map((value) => value * (1 - volumeLift / 100)), labels: inventoryLabels, value: money(inventoryTotal * Math.max(0, volumeLift) / 100), sub: "Demand-driven proxy", xAxis: "MT / วันที่ Snapshot", yAxis: "จำนวนสินค้าคงเหลือ", unit: "ชิ้น", simulationAxes: [pctAxis("demand", "Demand"), pctAxis("markdown", "Markdown", 0, 50, 1), pctAxis("writeoff", "Write-off", 0, 30, 1), pctAxis("transfer", "โอนสินค้าระหว่างสาขา", 0, 40, 1)] },
    { number: "11", title: "On Order & Supply", status: "SIM", detail: "PO, On Order และสมมติฐาน Supply", values: inventoryValues.map((value) => value * (1 + cogsLift / 100)), labels: inventoryLabels, value: money(inventoryTotal * Math.max(0, cogsLift) / 100), sub: "Supply assumption", xAxis: "MT / วันที่ Snapshot", yAxis: "จำนวน Supply", unit: "ชิ้น", simulationAxes: [pctAxis("purchase", "ปริมาณสั่งซื้อ", -50, 100, 1), pctAxis("leadtime", "Lead time", -30, 60, 1), pctAxis("fillrate", "Supplier fill rate", -30, 20, 1), pctAxis("cancellation", "PO cancellation", 0, 30, 1)] },
    { number: "12", title: "Data Quality Center", status: "LIVE", detail: "Freshness, Missing Amount และ Approval Queue", values: [dashboard?.data_quality.length ?? 0, queueTotal, dashboard?.publication_queue_total ?? 0], labels: ["Quality issues", "Approval queue", "Publication queue"], value: money(queueTotal), sub: "Approval queue", xAxis: "ประเภทปัญหา", yAxis: "จำนวนรายการ", unit: "รายการ", simulationAxes: [pctAxis("freshness", "ปรับเกณฑ์ Freshness", -50, 100, 1), pctAxis("tolerance", "Missing tolerance", -50, 100, 1), pctAxis("automation", "Auto approval", 0, 100, 1)] },
  ];
  const expandedModuleCard = moduleCards.find((card) => card.number === expandedModule) ?? null;
  const filteredUsers = users.filter((user) => {
    const haystack = `${user.display_name} ${user.username} ${user.email} ${user.department} ${user.job_title} ${user.role}`.toLowerCase();
    return haystack.includes(userSearch.trim().toLowerCase())
      && (userStatusFilter === "ALL" || user.status === userStatusFilter);
  });
  const referenceTarget = (report: string) => {
    const name = report.toLowerCase();
    if (name.includes("daily") || name.includes("monthly")) return "live-daily";
    if (name.includes("branch") || name.includes("sku") || name.includes("mt comparison")) return "live-rankings";
    if (name.includes("stock")) return "live-stock";
    if (name.includes("yoy")) return "live-yoy";
    return "analytics-modules";
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">EI</span>
          <span><strong>ESIP</strong><small>Enterprise Intelligence</small></span>
        </div>
        <nav aria-label="เมนูหลัก">
          {visibleNav.map(([id, label]) => (
            <button
              key={id}
              className={active === id ? "nav-item active" : "nav-item"}
              onClick={() => setActive(id)}
            >
              <span className="nav-dot" />{label}
              {id === "confirm" && queueTotal > 0 && (
                <span className="nav-badge">{queueTotal}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" />
          <div><strong>Daily Run: PASS</strong><small>{coverage?.last_date ?? "กำลังโหลด"}</small></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div><p className="eyebrow">ONE VERSION OF THE TRUTH</p><h1>{nav.find(([id]) => id === active)?.[1]}</h1></div>
          <div className="topbar-actions">
            <button className="theme-toggle" onClick={switchTheme} aria-label="สลับ Light/Dark Theme">
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
            {auth?.mode === "LOCAL_TRIAL" && (
              <label className="role-switcher">
                <span>ทดลอง Role</span>
                <select
                  value={localRole}
                  onChange={(event) => {
                    setLoading(true);
                    setLocalRole(event.target.value as Role);
                    setActive("dashboard");
                  }}
                >
                  <option value="ADMINISTRATOR">Administrator</option>
                  <option value="SALE_ADMIN">Sale Admin</option>
                  <option value="USER">User</option>
                </select>
              </label>
            )}
            <div className="user-chip">
              <span className="avatar">{auth?.user?.displayName?.slice(0, 1) ?? "E"}</span>
              <span><strong>{auth?.user?.displayName ?? "ESIP User"}</strong><small>{auth ? roleLabels[auth.role] : "USER"}</small></span>
            </div>
          </div>
        </header>

        {message && <div className="notice" role="status">{message}</div>}

        {active === "dashboard" && (
          <section className="page">
            <div className="hero-row">
              <div>
                <p className="eyebrow teal">SALE OUT CONTROL CENTER</p>
                <h2>ข้อมูลทุกวันที่มี<br />ถูกนำมารวมแล้ว</h2>
                <p className="subtext">
                  ช่วงข้อมูลปัจจุบัน {coverage?.first_date ?? "—"} ถึง {coverage?.last_date ?? "—"} รวม {coverage?.available_days ?? 0} วัน
                </p>
              </div>
              <button className="primary" onClick={() => setActive("reports")}>เปิดรายงานตาม Reference <span>→</span></button>
            </div>
            <div className="kpi-grid">
              <article className="kpi"><span>Sales rows</span><strong>{money(coverage?.sales_rows ?? 0)}</strong><small>ข้อมูลที่โหลดเข้าระบบ</small></article>
              <article className="kpi"><span>Sales amount ex.VAT</span><strong>{money(coverage?.sales_amount ?? 0)}</strong><small>ทุกวันที่มีข้อมูล</small></article>
              <article className="kpi"><span>Sales quantity</span><strong>{money(coverage?.sales_qty ?? 0)}</strong><small>{coverage?.available_days ?? 0} available days</small></article>
              <article className="kpi warning"><span>Confirm queue</span><strong>{loading ? "—" : money(queueTotal)}</strong><small>รายการย่อยจริง</small></article>
            </div>
            <div className="dashboard-grid">
              <article className="panel trend-panel" id="live-daily">
                <div className="panel-head"><div><p className="eyebrow">DAILY SALES TREND</p><h3>ยอดขายรายวัน</h3></div><span className="status-pill">{trend.length} วัน</span></div>
                <DailySalesChart rows={trend} money={money} />
              </article>
              <article className="panel action-panel">
                <div className="panel-head"><div><p className="eyebrow">REFERENCE COVERAGE</p><h3>สิ่งที่ดูได้แล้ว</h3></div></div>
                {(dashboard?.reference_coverage ?? []).slice(0, 5).map((item, index) => (
                  <div className="action-row" key={item.report}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{item.report}</strong><small>{item.note}</small></div>
                    {item.status === "AVAILABLE"
                      ? <button onClick={() => document.getElementById(referenceTarget(item.report))?.scrollIntoView({ behavior: "smooth", block: "start" })}>ดูข้อมูล</button>
                      : <b>MODEL</b>}
                  </div>
                ))}
              </article>
            </div>
            <div className="dashboard-section-head">
              <div><p className="eyebrow teal">ENTERPRISE PERFORMANCE MAP</p><h3>ภาพรวมทุกมิติที่ผู้บริหารควรเห็น</h3></div>
              <span className="data-scope">ACTUAL DATA · {coverage?.first_date ?? "—"} → {coverage?.last_date ?? "—"}</span>
            </div>
            <div className="executive-strip">
              <article><span>ยอดขายวันล่าสุด</span><strong>{money(latestDay?.net_amount ?? 0)}</strong><small>{latestDay?.sales_date ?? "รอข้อมูล"}</small></article>
              <article><span>เทียบวันก่อนหน้า</span><strong className={dailyChange !== null && dailyChange < 0 ? "negative" : "positive"}>{dailyChange === null ? "N/A" : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(1)}%`}</strong><small>Daily momentum</small></article>
              <article><span>MT ที่มีข้อมูล</span><strong>{sourceSales.length} / 7</strong><small>TA รอ Daily Raw</small></article>
              <article><span>Stock on hand</span><strong>{money(inventoryTotal)}</strong><small>Latest snapshot รวมทุก MT</small></article>
              <article><span>Data issues</span><strong>{dashboard?.data_quality.length ?? 0}</strong><small>รายการที่ต้องตรวจสอบ</small></article>
            </div>
            <SourceStatusBoard
              imports={imports}
              money={money}
              rows={dashboard?.source_sales ?? []}
              sourceStatus={dashboard?.source_status ?? []}
            />
            <div className="dashboard-section-head" id="live-rankings">
              <div><p className="eyebrow teal">AVAILABLE ANALYTICS</p><h3>ข้อมูลจริงที่เปิดดูได้ทันที</h3></div>
              <small>แสดงบนหน้า Overview โดยไม่ต้องกดเปิด Detail</small>
            </div>
            <div className="live-analytics-grid">
              <article className="panel mt-mix live-analytics-panel">
                <div className="panel-head"><div><p className="eyebrow">MT CONTRIBUTION</p><h3>สัดส่วนยอดขายตาม MT</h3></div><span className="status-pill">LIVE</span></div>
                <div className="mix-list">
                  {sourceSales.map((row) => (
                    <div key={row.source_code}>
                      <span className="source-logo mini">{row.source_code}</span>
                      <span className="mix-name"><strong>{row.source_code}</strong><small>{row.available_days} วัน · {money(row.net_qty)} ชิ้น</small></span>
                      <span className="mix-track"><i style={{ width: `${Math.max((Number(row.net_amount) / sourceMax) * 100, 2)}%` }} /></span>
                      <b>{money(row.net_amount)}</b>
                    </div>
                  ))}
                </div>
              </article>
              <RankedAnalyticsPanel
                eyebrow="BRANCH PERFORMANCE"
                title="Top 8 สาขาตามยอดขาย"
                rows={(dashboard?.top_branches ?? []).slice(0, 8).map((row) => ({
                  code: row.source_code,
                  label: row.branch_source_name || "ไม่ระบุสาขา",
                  value: Number(row.net_amount) || 0,
                  detail: `${money(row.net_qty)} ชิ้น`,
                }))}
                money={money}
              />
              <RankedAnalyticsPanel
                eyebrow="PRODUCT PERFORMANCE"
                title="Top 8 SKU ตามยอดขาย"
                rows={(dashboard?.top_products ?? []).slice(0, 8).map((row) => ({
                  code: row.sap_item_code || "N/A",
                  label: row.source_sku || "ไม่ระบุ Source SKU",
                  value: Number(row.net_amount) || 0,
                  detail: `${money(row.net_qty)} ชิ้น`,
                }))}
                money={money}
              />
              <InventoryAnalyticsPanel rows={dashboard?.inventory ?? []} money={money} />
            </div>
            <YoYAnalyticsPanel rows={trend} money={money} />
            <div className="dashboard-section-head compact">
              <div id="analytics-modules"><p className="eyebrow">FURTHER ANALYSIS</p><h3>Dashboard สำหรับเจาะรายละเอียดและ Simulation</h3></div>
              <small>ใช้ Detail เมื่อต้องการปรับสมมติฐานหรือวิเคราะห์ลึกกว่าภาพรวม</small>
            </div>
            <div className="module-grid">
              {moduleCards.map((card) => (
                <DashboardModuleCard key={card.number} {...card} onOpen={() => setExpandedModule(card.number)} />
              ))}
            </div>
          </section>
        )}

        {active === "simulations" && (
          <section className="page">
            <div className="section-title">
              <div>
                <p className="eyebrow teal">SIMULATION LAB</p>
                <h2>ทดลองตัวเลขแยกตาม Dashboard</h2>
                <p className="subtext">พื้นที่นี้แยกจาก C-Level Dashboard โดยเฉพาะ ปรับสมมติฐานได้โดยไม่เปลี่ยนข้อมูลจริงและไม่กระทบรายงานที่ผู้บริหารใช้ดูประจำวัน</p>
              </div>
              <span className="data-scope">BASE ACTUAL • {coverage?.first_date ?? "—"} → {coverage?.last_date ?? "—"}</span>
            </div>
            <SimulationLab
              cogsLift={cogsLift}
              money={money}
              priceLift={priceLift}
              setCogsLift={setCogsLift}
              setPriceLift={setPriceLift}
              setVolumeLift={setVolumeLift}
              simulation={simulation}
              volumeLift={volumeLift}
            />
            <div className="simulation-dashboard-grid">
              <ScenarioDashboardCard title="Executive Summary" status="READY" value={simulation.simulatedRevenue} delta={simulation.revenueDelta} deltaLabel={`${simulation.revenueDelta >= 0 ? "+" : ""}${money(simulation.revenueDelta)}`} money={money} detail="Revenue, quantity, MT coverage and daily momentum respond to price and volume assumptions." />
              <ScenarioDashboardCard title="Sales Performance" status="READY" value={(latestDay?.net_amount ?? 0) * (1 + priceLift / 100) * (1 + volumeLift / 100)} delta={priceLift + volumeLift} money={money} detail="Daily sales, MTD pace and MT comparison use the same scenario controls." />
              <ScenarioDashboardCard title="Product Intelligence" status="READY" value={simulation.simulatedRevenue * 0.2} delta={priceLift + volumeLift} money={money} detail="Top SKU contribution scales from actual product mix while mapping remains unchanged." />
              <ScenarioDashboardCard title="Branch Intelligence" status="READY" value={simulation.simulatedRevenue * 0.18} delta={priceLift + volumeLift} money={money} detail="Top branch performance scales from actual branch contribution and demand assumptions." />
              <ScenarioDashboardCard title="Inventory Control" status="MODEL" value={inventoryTotal * (1 - volumeLift / 100)} delta={-volumeLift} money={money} unit="QTY" detail="On hand changes by simulated demand until replenishment rules are connected." />
              <ScenarioDashboardCard title="Target Achievement" status="MODEL" value={simulation.simulatedRevenue / Math.max(simulation.revenue * 1.05, 1) * 100} delta={priceLift + volumeLift - 5} money={money} unit="%" detail="Uses a temporary target baseline of actual sales plus 5%." />
              <ScenarioDashboardCard title="Forecast & Run Rate" status="MODEL" value={(latestDay?.net_amount ?? 0) * 30 * (1 + volumeLift / 100)} delta={volumeLift} money={money} detail="Month-end run rate uses the latest loaded day and volume assumption." />
              <ScenarioDashboardCard title="Gross Profit" status="MODEL" value={simulation.simulatedGp} delta={simulation.gpDelta} deltaLabel={`${simulation.gpDelta >= 0 ? "+" : ""}${money(simulation.gpDelta)}`} money={money} detail="COGS slider applies to a 72% baseline until actual cost data arrives." />
              <ScenarioDashboardCard title="YoY Comparison" status="READY" value={simulation.simulatedRevenue} delta={priceLift + volumeLift} money={money} detail="History now starts in 2025, so overlapping YoY periods can be compared." />
              <ScenarioDashboardCard title="Stock Aging" status="MODEL" value={inventoryTotal * Math.max(0, volumeLift) / 100} delta={volumeLift} money={money} unit="QTY" detail="Demand uplift reduces slow-moving risk; demand decline increases the aging proxy." />
              <ScenarioDashboardCard title="On Order & Supply" status="MODEL" value={inventoryTotal * Math.max(0, cogsLift) / 100} delta={cogsLift} money={money} unit="QTY" detail="Supply uplift is modeled until PO/on-order and receiving history are connected." />
              <ScenarioDashboardCard title="Data Quality Center" status="READY" value={queueTotal} delta={0} money={money} unit="ITEM" detail="Approval queue and data-quality indicators remain separated from financial assumptions." />
            </div>
          </section>
        )}

        {active === "reports" && (
          <section className="page">
            <div className="section-title"><div><p className="eyebrow teal">REFERENCE BOOK COVERAGE</p><h2>รายงาน Sale Out</h2><p className="subtext">โครงสร้างตาม “สรุป Sale Out.xlsx” และ “Current Dashboard” โดยใช้ข้อมูลจริงที่มีอยู่ใน ESIP</p></div></div>
            <div className="report-grid">
              <ReportTable title="ยอดขายแยก MT" columns={["MT", "วันแรก", "วันล่าสุด", "จำนวนวัน", "QTY", "Amount ex.VAT"]} rows={(dashboard?.source_sales ?? []).map((row) => [row.source_code, row.first_date, row.last_date, row.available_days, money(row.net_qty), money(row.net_amount)])} />
              <ReportTable title="Top 15 สาขา" columns={["MT", "สาขา", "QTY", "Amount ex.VAT"]} rows={(dashboard?.top_branches ?? []).map((row) => [row.source_code, row.branch_source_name || "ไม่ระบุ", money(row.net_qty), money(row.net_amount)])} />
              <ReportTable title="Top 15 SKU" columns={["SAP Item", "Source SKU", "QTY", "Amount ex.VAT"]} rows={(dashboard?.top_products ?? []).map((row) => [row.sap_item_code, row.source_sku, money(row.net_qty), money(row.net_amount)])} />
              <ReportTable title="Stock on Hand ล่าสุด" columns={["MT", "Snapshot", "On Hand QTY", "On Hand Value"]} rows={(dashboard?.inventory ?? []).map((row) => [row.source_code, row.snapshot_date, money(row.onhand_qty), money(row.onhand_value)])} />
            </div>
            <article className="panel coverage-status">
              <div className="panel-head"><div><p className="eyebrow">DELIVERY STATUS</p><h3>เทียบกับ Reference Book</h3></div></div>
              {(dashboard?.reference_coverage ?? []).map((item) => (
                <div key={item.report}><strong>{item.report}</strong><span className={item.status === "AVAILABLE" ? "available" : "waiting"}>{item.status}</span><p>{item.note}</p></div>
              ))}
            </article>
            {(dashboard?.data_quality ?? []).length > 0 && (
              <article className="panel coverage-status data-warning">
                <div className="panel-head"><div><p className="eyebrow">DATA QUALITY NOTE</p><h3>ข้อมูลที่ยังทำให้รายงานไม่ครบ</h3></div></div>
                {dashboard?.data_quality.map((item) => (
                  <div key={`${item.source_code}-${item.issue}`}>
                    <strong>{item.source_code}: {item.issue}</strong>
                    <span className="waiting">REVIEW</span>
                    <p>{money(item.affected_rows)} rows — ตาราง QTY ใช้ได้ แต่ Amount ของแหล่งนี้ยังเป็นศูนย์</p>
                  </div>
                ))}
              </article>
            )}
          </section>
        )}

        {active === "imports" && auth?.role !== "USER" && (
          <section className="page">
            <div className="section-title">
              <div>
                <p className="eyebrow teal">DATA INTAKE & ORCHESTRATION</p>
                <h2>ศูนย์นำเข้าข้อมูล MT</h2>
                <p className="subtext">เลือกหลายไฟล์พร้อมกัน ให้ระบบตรวจ MT จากชื่อไฟล์ หรือระบุ MT เอง แล้วสั่ง Process ทันทีได้จากหน้าเดียว</p>
              </div>
              <div className="permission ok"><span>✓</span><div><strong>{roleLabels[auth.role]}</strong><small>UPLOAD & PROCESS</small></div></div>
            </div>
            <div className="import-kpis">
              <article className="kpi"><span>ไฟล์ในพื้นที่รับเข้า</span><strong>{imports?.pending_files.length ?? 0}</strong><small>{imports?.pending_files.filter((item) => item.pending).length ?? 0} ไฟล์ใหม่หลังรอบล่าสุด</small></article>
              <article className="kpi"><span>Auto schedule</span><strong>{imports?.scheduler.enabled ? imports.scheduler.time : "OFF"}</strong><small>{imports?.scheduler.timezone ?? "Asia/Bangkok"} ทุกวัน</small></article>
              <article className="kpi"><span>Telegram</span><strong>{imports?.scheduler.telegram_configured ? "READY" : "SETUP"}</strong><small>{imports?.scheduler.telegram_configured ? "แจ้งผลหลัง Process" : "รอ Bot Token และ Chat ID"}</small></article>
              <article className="kpi"><span>Engine</span><strong>{imports?.scheduler.running ? "RUNNING" : "READY"}</strong><small>ป้องกันการ Process ซ้อนกัน</small></article>
            </div>
            <div className="import-layout">
              <article className="panel upload-panel">
                <div className="panel-head"><div><p className="eyebrow">MANUAL UPLOAD</p><h3>Browse หรือลากไฟล์มาวาง</h3></div><span className="status-pill">250 MB / ไฟล์</span></div>
                <div className="upload-controls">
                  <label><span>การระบุ MT</span><select value={importSource} onChange={(event) => setImportSource(event.target.value)}><option value="AUTO">Auto Detect</option>{(imports?.sources ?? ["DH", "GBH", "HH", "HP_MH", "TWD", "TA"]).map((source) => <option value={source} key={source}>{source}</option>)}</select></label>
                  <label className="drop-zone"><input type="file" multiple accept=".xlsx,.xls,.zip,.csv" onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))} /><strong>{uploadFiles.length ? `${uploadFiles.length} ไฟล์พร้อมนำเข้า` : "เลือกไฟล์จากเครื่อง"}</strong><small>{uploadFiles.map((file) => file.name).join(" • ") || "รองรับ Excel, CSV และ ZIP"}</small></label>
                </div>
                <div className="import-actions"><button className="reject" disabled={importWorking} onClick={() => uploadAndProcess(false)}>เก็บไว้รอ Process</button><button className="approve" disabled={importWorking} onClick={() => uploadAndProcess(true)}>{importWorking ? "กำลังทำงาน..." : "Upload & Process ทันที"}</button></div>
              </article>
              <article className="panel folder-panel">
                <div className="panel-head"><div><p className="eyebrow">FOLDER INBOX</p><h3>ไฟล์ที่นำมาวางไว้แล้ว</h3></div><button className="approve" disabled={importWorking} onClick={() => processImports()}>{importWorking ? "กำลัง Process..." : "Process ทุก MT"}</button></div>
                <div className="file-list">
                  {(imports?.pending_files ?? []).slice(0, 12).map((file) => <div key={`${file.source}-${file.filename}`}><span className="source-logo mini">{file.source}</span><span><strong>{file.filename}</strong><small>{file.modified_at} • {(file.size / 1024 / 1024).toFixed(1)} MB</small></span><b className={file.pending ? "new" : ""}>{file.pending ? "NEW" : "LOADED"}</b></div>)}
                  {(imports?.pending_files.length ?? 0) === 0 && <div className="empty">ยังไม่มีไฟล์ใน Folder incoming</div>}
                </div>
              </article>
            </div>
            <article className="panel import-history">
              <div className="panel-head"><div><p className="eyebrow">PROCESS HISTORY</p><h3>ประวัติการนำเข้าและผลตรวจสอบ</h3></div></div>
              <div className="history-table">
                <div className="history-head"><span>เวลา / Run</span><span>วิธีนำเข้า</span><span>ผู้ดำเนินการ</span><span>ผล</span><span>รายละเอียด</span></div>
                {(imports?.history ?? []).slice(0, 20).map((event, index) => <div key={`${event.run_id}-${index}`}><span><strong>{event.run_id}</strong><small>{event.finished_at ?? event.started_at ?? ""}</small></span><span>{event.trigger}</span><span>{event.actor || "System"}</span><span className={`run-status ${event.status.toLowerCase()}`}>{event.status}</span><span className="history-detail">{event.filename ? `${event.source}: ${event.filename}` : event.detail || "Completed"}</span></div>)}
              </div>
            </article>
          </section>
        )}

        {active === "confirm" && auth?.canConfirm && (
          <section className="page">
            <div className="section-title">
              <div><p className="eyebrow teal">ตรวจสอบก่อนเชื่อมข้อมูลเข้ากับ SAP</p><h2>รายการที่รอการยืนยัน</h2><p className="subtext">ระบบพบรหัสสินค้าหรือสาขาที่น่าจะตรงกัน กรุณาตรวจทีละรายการ เมื่อกดยืนยัน ระบบจะใช้ Mapping นี้กับข้อมูลทันที</p></div>
              <div className="permission ok"><span>✓</span><div><strong>{roleLabels[auth.role]}</strong><small>มีสิทธิ์ยืนยันและใช้งาน</small></div></div>
            </div>
            <div className="confirm-guide">
              <article><span>1</span><div><strong>ตรวจข้อมูลต้นทาง</strong><p>ดูชื่อ MT และรหัสที่ได้รับจากไฟล์</p></div></article>
              <article><span>2</span><div><strong>ตรวจรหัส SAP ที่ระบบแนะนำ</strong><p>ดูเหตุผลและจำนวนข้อมูลที่จะได้รับผล</p></div></article>
              <article><span>3</span><div><strong>กรอกที่มาแล้วตัดสินใจ</strong><p>เช่น “ตรวจโดยคุณชัยวัฒน์ 24/07/69” แล้วกดยืนยันหรือยังไม่ยืนยัน</p></div></article>
            </div>
            <div className="queue-tools">
              <select value={queueType} onChange={(event) => setQueueType(event.target.value as typeof queueType)}>
                <option value="all">ทั้งหมด: สินค้าและสาขา</option>
                <option value="product">เฉพาะรหัสสินค้า</option>
                <option value="branch">เฉพาะสาขา</option>
              </select>
              <input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="ค้นหาชื่อ MT, รหัสสินค้า, สาขา หรือรหัส SAP" />
              <span>รอตรวจทั้งหมด <strong>{money(queueTotal)}</strong> รายการ</span>
            </div>
            <div className="queue">
              {queue.map((item) => (
                <article className="queue-card" key={item.id}>
                  <div className="queue-meta">
                    <span className={`priority ${item.priority.toLowerCase()}`}>{item.priority} · {priorityLabels[item.priority] ?? "รอตรวจ"}</span>
                    <span className="category">{item.queue_kind === "BRANCH" ? "ตรวจสาขา" : "ตรวจรหัสสินค้า"}</span>
                    <span className="source">{sourceNames[item.source_code] ?? item.source_code} <small>({item.source_code})</small></span>
                  </div>
                  <div className="queue-content">
                    <div><small>รหัสที่ได้รับจาก {sourceNames[item.source_code] ?? item.source_code}</small><strong>{item.subject}</strong></div>
                    <div><small>รหัส SAP ที่ระบบแนะนำ</small><strong>{item.candidate}</strong></div>
                    <div><small>เหตุผลที่แนะนำ</small><strong>{evidenceLabels[item.evidence] ?? item.evidence.replaceAll("_", " ")}</strong></div>
                    <div><small>ข้อมูลที่จะได้รับผล</small><strong>{money(item.affected_rows)} แถว</strong></div>
                  </div>
                  <div className="candidate-correction">
                    {!editingCandidate[String(item.id)] ? (
                      <button onClick={() => {
                        setEditingCandidate((old) => ({ ...old, [String(item.id)]: true }));
                        setOverrideCandidate((old) => ({ ...old, [String(item.id)]: item.candidate }));
                      }}>รหัสที่แนะนำไม่ถูกต้อง — แก้ไขรหัส SAP</button>
                    ) : (
                      <div className="correction-editor">
                        <div>
                          <label>ค้นหาและเลือกรหัส SAP ที่ถูกต้อง</label>
                          <input
                            value={overrideCandidate[String(item.id)] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value.toUpperCase();
                              setOverrideCandidate((old) => ({ ...old, [String(item.id)]: value }));
                              searchMaster(item, value).catch(() => undefined);
                            }}
                            placeholder={item.queue_kind === "BRANCH" ? "พิมพ์ CardCode หรือชื่อสาขา" : "พิมพ์ ItemCode หรือชื่อสินค้า"}
                          />
                          <div className="master-suggestions">
                            {(masterSuggestions[String(item.id)] ?? []).map((option) => (
                              <button key={option.code} onClick={() => {
                                setOverrideCandidate((old) => ({ ...old, [String(item.id)]: option.code }));
                                setMasterSuggestions((old) => ({ ...old, [String(item.id)]: [] }));
                              }}><strong>{option.code}</strong><span>{option.name}</span></button>
                            ))}
                          </div>
                        </div>
                        <button className="cancel-correction" onClick={() => {
                          setEditingCandidate((old) => ({ ...old, [String(item.id)]: false }));
                          setOverrideCandidate((old) => {
                            const next = { ...old };
                            delete next[String(item.id)];
                            return next;
                          });
                        }}>ยกเลิกการแก้ไข</button>
                      </div>
                    )}
                    {editingCandidate[String(item.id)] && overrideCandidate[String(item.id)] && overrideCandidate[String(item.id)] !== item.candidate && (
                      <p>ระบบจะเปลี่ยนจาก <strong>{item.candidate}</strong> เป็น <strong>{overrideCandidate[String(item.id)]}</strong> และตรวจสอบกับ Master ก่อนใช้งาน</p>
                    )}
                  </div>
                  <div className="decision-bar">
                    <label><span>บันทึกว่าใครตรวจหรืออ้างอิงจากอะไร <b>จำเป็นต้องกรอก</b></span><input value={reference[String(item.id)] ?? ""} onChange={(event) => setReference((old) => ({ ...old, [String(item.id)]: event.target.value }))} placeholder="ตัวอย่าง: ตรวจโดยคุณชัยวัฒน์ 24/07/69 หรือ EMAIL-1234" /></label>
                    <button className="reject" disabled={working === item.id} onClick={() => decide(item, "REJECTED")}>ยังไม่ยืนยัน</button>
                    <button className="approve" disabled={working === item.id} onClick={() => decide(item, "APPROVED")}>{working === item.id ? "กำลังบันทึก..." : "ยืนยันและใช้งานทันที"}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {active === "sources" && (
          <section className="page">
            <div className="section-title">
              <div>
                <p className="eyebrow teal">RAW PATH & UPDATE STATUS</p>
                <h2>สถานะ RAW Data แยกแต่ละ MT</h2>
                <p className="subtext">เห็นทั้ง path ต้นทาง, path ในระบบ, วันที่ข้อมูลล่าสุด และจำนวนไฟล์ที่ยังรอ process เพื่อช่วยเช็คตอนเช้าหลังรอบ NAS Auto Import</p>
              </div>
              <button className="primary" onClick={() => loadImports().catch(() => undefined)}>Refresh Import Status <span>↻</span></button>
            </div>
            <SourceStatusBoard
              detailed
              imports={imports}
              money={money}
              rows={dashboard?.source_sales ?? []}
              sourceStatus={dashboard?.source_status ?? []}
            />
          </section>
        )}

        {active === "audit" && auth?.role !== "USER" && (
          <section className="page">
            <div className="section-title"><div><p className="eyebrow teal">GOVERNED HISTORY</p><h2>Approval Audit Log</h2></div></div>
            <div className="audit-list">
              {audit.length === 0 && <div className="empty">ยังไม่มีการ Confirm</div>}
              {audit.map((event) => <article key={event.id}><span className={event.action === "APPROVED" ? "audit-icon approved" : "audit-icon rejected"} /><div><strong>{event.action}</strong><p>{event.detail}</p><small>{event.actor_email} · {event.created_at}</small></div></article>)}
            </div>
          </section>
        )}

        {active === "authorize" && auth?.role === "ADMINISTRATOR" && (
          <section className="page">
            <div className="section-title">
              <div>
                <p className="eyebrow teal">ADMINISTRATOR ONLY</p>
                <h2>Authorize Matrix</h2>
                <p className="subtext">กำหนดสิทธิ์การเห็นเมนูและจัดการผู้ใช้จากหน้าเดียว การเปลี่ยนสิทธิ์จะยังไม่ถูกใช้จนกว่าจะกด Save changes</p>
              </div>
              <div className="management-actions">
                <button className="reject" disabled={!permissionsDirty} onClick={resetPermissionMatrix}>Discard</button>
                <button className="approve" disabled={!permissionsDirty} onClick={() => savePermissionMatrix().catch((error) => setMessage(error instanceof Error ? error.message : "บันทึกสิทธิ์ไม่สำเร็จ"))}>Save changes</button>
              </div>
            </div>
            <div className="role-grid">
              <article className="panel role-card"><span>01</span><h3>Administrator</h3><p>บริหารผู้ใช้, role, import, confirm/apply, audit และ system settings</p></article>
              <article className="panel role-card"><span>02</span><h3>Sale Admin</h3><p>ดูข้อมูลขาย, upload/process RAW, confirm mapping และดู audit งานขาย</p></article>
              <article className="panel role-card"><span>03</span><h3>User</h3><p>ดู dashboard และรายงานแบบอ่านอย่างเดียว ไม่มีสิทธิ์ action หลังบ้าน</p></article>
            </div>
            <AuthorizationMatrix
              dirty={permissionsDirty}
              onChange={savePermission}
              permissions={draftPermissions}
            />
            <article className="panel user-management">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">USER MANAGEMENT</p>
                  <h3>ผู้ใช้งานและสถานะการเข้าถึง</h3>
                  <p className="panel-description">จัดการข้อมูลผู้ใช้ แผนก ตำแหน่ง วิธีเข้าสู่ระบบ สถานะ และ Role จากจุดเดียว</p>
                </div>
                <button className="approve" onClick={() => setEditingUser({ ...emptyUserDraft })}>+ เพิ่มผู้ใช้</button>
              </div>
              <div className="user-toolbar">
                <label>
                  <span>ค้นหาผู้ใช้</span>
                  <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="ชื่อ อีเมล แผนก ตำแหน่ง หรือ Role" />
                </label>
                <label>
                  <span>สถานะ</span>
                  <select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value as typeof userStatusFilter)}>
                    <option value="ALL">ทั้งหมด</option>
                    <option value="ACTIVE">ใช้งานอยู่</option>
                    <option value="SUSPENDED">ระงับใช้งาน</option>
                  </select>
                </label>
              </div>
              <div className="user-summary">
                <span><strong>{users.length}</strong> ผู้ใช้ทั้งหมด</span>
                <span><strong>{users.filter((user) => user.status === "ACTIVE").length}</strong> ใช้งานอยู่</span>
                <span><strong>{users.filter((user) => user.auth_source === "ACTIVE_DIRECTORY").length}</strong> เชื่อม Windows AD</span>
                <span><strong>{users.filter((user) => user.failed_attempts > 0 || Boolean(user.locked_until)).length}</strong> ต้องตรวจสอบความปลอดภัย</span>
              </div>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead><tr><th>ผู้ใช้</th><th>Role / แผนก</th><th>เข้าสู่ระบบ</th><th>ความปลอดภัย</th><th>เข้าใช้ล่าสุด</th><th>จัดการ</th></tr></thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.email}>
                        <td>
                          <span className="user-identity">
                            <b className="avatar">{(user.display_name || user.email).slice(0, 2).toUpperCase()}</b>
                            <span><strong>{user.display_name || "ยังไม่ได้ระบุชื่อ"}</strong><small>@{user.username || user.email.split("@")[0]} · {user.email}</small></span>
                          </span>
                        </td>
                        <td><strong>{roleLabels[user.role]}</strong><small>{[user.department, user.job_title].filter(Boolean).join(" · ") || "ยังไม่ได้ระบุ"}</small></td>
                        <td><span className="auth-source">{user.auth_source === "ACTIVE_DIRECTORY" ? "Windows AD" : "Local"}</span></td>
                        <td>
                          <span className={`user-status ${user.status.toLowerCase()}`}>{user.status === "ACTIVE" ? "ใช้งานอยู่" : "ระงับใช้งาน"}</span>
                          <small>{user.locked_until ? `ล็อกถึง ${user.locked_until}` : user.failed_attempts > 0 ? `เข้าสู่ระบบผิด ${user.failed_attempts} ครั้ง` : "ไม่พบความเสี่ยง"}</small>
                        </td>
                        <td><span>{user.last_login_at || "ยังไม่มีข้อมูล"}</span><small>สร้าง {user.created_at}</small></td>
                        <td>
                          <div className="row-actions">
                            <button className="module-open" onClick={() => setEditingUser({
                              email: user.email,
                              username: user.username,
                              role: user.role,
                              display_name: user.display_name,
                              department: user.department,
                              job_title: user.job_title,
                              auth_source: user.auth_source,
                              status: user.status,
                            })}>แก้ไข</button>
                            {(user.failed_attempts > 0 || user.locked_until) && <button className="module-open" onClick={() => manageUserAccess(user.email, "UNLOCK")}>ปลดล็อก</button>}
                            <button
                              className={user.status === "ACTIVE" ? "reject" : "module-open"}
                              onClick={() => manageUserAccess(user.email, user.status === "ACTIVE" ? "SUSPEND" : "ACTIVATE")}
                            >
                              {user.status === "ACTIVE" ? "ระงับ" : "เปิดใช้"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && <div className="empty">ไม่พบผู้ใช้ตามเงื่อนไขที่เลือก</div>}
              </div>
              <div className="user-activity">
                <div className="panel-head"><div><p className="eyebrow">SECURITY AUDIT</p><h4>กิจกรรมจัดการผู้ใช้ล่าสุด</h4></div><span className="status-pill">INSERT ONLY</span></div>
                {userEvents.length === 0 && <div className="empty">ยังไม่มีกิจกรรมจัดการผู้ใช้</div>}
                {userEvents.slice(0, 10).map((event) => (
                  <article key={event.id}>
                    <span className="audit-icon approved" />
                    <div><strong>{event.action.replace("USER_", "")}</strong><p>{event.detail}</p><small>{event.actor_email} · {event.created_at}</small></div>
                  </article>
                ))}
              </div>
            </article>
          </section>
        )}

        {expandedModuleCard && (
          <ModuleDetailModal
            card={expandedModuleCard}
            money={money}
            onClose={() => setExpandedModule(null)}
          />
        )}
        {editingUser && (
          <UserEditor
            draft={editingUser}
            isNew={!users.some((user) => user.email === editingUser.email)}
            onCancel={() => setEditingUser(null)}
            onChange={setEditingUser}
            onSave={() => saveUser(editingUser)}
          />
        )}
      </main>

      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {visibleNav.slice(0, 3).map(([id, label]) => <button key={id} onClick={() => setActive(id)} className={active === id ? "active" : ""}><span>{id === "dashboard" ? "⌂" : id === "reports" ? "▥" : "✓"}</span>{label}</button>)}
      </nav>
    </div>
  );
}

function RankedAnalyticsPanel({
  eyebrow,
  money,
  rows,
  title,
}: {
  eyebrow: string;
  money: (value: number) => string;
  rows: Array<{ code: string; label: string; value: number; detail: string }>;
  title: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <article className="panel live-analytics-panel ranked-panel">
      <div className="panel-head"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div><span className="status-pill">LIVE</span></div>
      <div className="ranked-list">
        {rows.map((row, index) => (
          <div key={`${row.code}-${row.label}`}>
            <span className="rank-number">{index + 1}</span>
            <span className="rank-label"><strong>{row.label}</strong><small>{row.code} · {row.detail}</small></span>
            <span className="rank-bar"><i style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} /></span>
            <b>{money(row.value)}</b>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">ยังไม่มีข้อมูล</div>}
      </div>
    </article>
  );
}

function InventoryAnalyticsPanel({
  money,
  rows,
}: {
  money: (value: number) => string;
  rows: DashboardData["inventory"];
}) {
  const max = Math.max(...rows.map((row) => Number(row.onhand_qty) || 0), 1);
  return (
    <article className="panel live-analytics-panel" id="live-stock">
      <div className="panel-head"><div><p className="eyebrow">STOCK ON HAND</p><h3>สินค้าคงเหลือล่าสุดแยก MT</h3></div><span className="status-pill">LIVE</span></div>
      <div className="inventory-live-list">
        {rows.map((row) => (
          <div key={row.source_code}>
            <span className="source-logo mini">{row.source_code}</span>
            <span><strong>{sourceNames[row.source_code] ?? row.source_code}</strong><small>Snapshot {row.snapshot_date}</small></span>
            <span className="inventory-live-bar"><i style={{ width: `${Math.max((Number(row.onhand_qty) / max) * 100, 2)}%` }} /></span>
            <span className="inventory-live-value"><strong>{money(row.onhand_qty)} ชิ้น</strong><small>{money(row.onhand_value)} บาท</small></span>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">ยังไม่มีข้อมูล Stock Snapshot</div>}
      </div>
    </article>
  );
}

function YoYAnalyticsPanel({
  money,
  rows,
}: {
  money: (value: number) => string;
  rows: DashboardData["trend"];
}) {
  const monthly = new Map<string, number>();
  for (const row of rows) {
    const key = row.sales_date.slice(0, 7);
    monthly.set(key, (monthly.get(key) ?? 0) + (Number(row.net_amount) || 0));
  }
  const year2025 = Array.from({ length: 12 }, (_, index) => monthly.get(`2025-${String(index + 1).padStart(2, "0")}`) ?? 0);
  const year2026 = Array.from({ length: 12 }, (_, index) => monthly.get(`2026-${String(index + 1).padStart(2, "0")}`) ?? 0);
  const max = Math.max(...year2025, ...year2026, 1);
  const monthLabels = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const comparableMonths = year2026.filter((value) => value > 0).length;
  const comparable2025 = year2025.slice(0, comparableMonths).reduce((sum, value) => sum + value, 0);
  const comparable2026 = year2026.slice(0, comparableMonths).reduce((sum, value) => sum + value, 0);
  const growth = comparable2025 ? ((comparable2026 - comparable2025) / comparable2025) * 100 : null;
  return (
    <article className="panel yoy-live-panel" id="live-yoy">
      <div className="panel-head">
        <div><p className="eyebrow">YEAR-OVER-YEAR</p><h3>ยอดขายรายเดือน 2025 เทียบ 2026</h3></div>
        <span className={`yoy-growth ${growth !== null && growth < 0 ? "negative" : "positive"}`}>{growth === null ? "N/A" : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% YTD`}</span>
      </div>
      <div className="yoy-legend"><span><i className="year-2025" />2025</span><span><i className="year-2026" />2026</span><small>เปรียบเทียบ {comparableMonths} เดือนที่มีข้อมูลร่วมกัน</small></div>
      <div className="yoy-bars" role="img" aria-label="กราฟยอดขายรายเดือนปี 2025 เทียบ 2026">
        {monthLabels.map((month, index) => (
          <div key={month}>
            <span className="yoy-bar-pair">
              <i className="year-2025" style={{ height: `${Math.max((year2025[index] / max) * 100, year2025[index] ? 2 : 0)}%` }} title={`${month} 2025: ${money(year2025[index])} บาท`} />
              <i className="year-2026" style={{ height: `${Math.max((year2026[index] / max) * 100, year2026[index] ? 2 : 0)}%` }} title={`${month} 2026: ${money(year2026[index])} บาท`} />
            </span>
            <b>{month}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function ReportTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <article className="panel report-table">
      <div className="panel-head"><div><p className="eyebrow">LIVE DATA</p><h3>{title}</h3></div></div>
      <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    </article>
  );
}

function SimulationLab({
  cogsLift,
  compact = false,
  money,
  priceLift,
  setCogsLift,
  setPriceLift,
  setVolumeLift,
  simulation,
  volumeLift,
}: {
  cogsLift: number;
  compact?: boolean;
  money: (value: number) => string;
  priceLift: number;
  setCogsLift: (value: number) => void;
  setPriceLift: (value: number) => void;
  setVolumeLift: (value: number) => void;
  simulation: {
    revenue: number;
    quantity: number;
    simulatedRevenue: number;
    simulatedGp: number;
    revenueDelta: number;
    gpDelta: number;
    margin: number;
  };
  volumeLift: number;
}) {
  return (
    <article className={`panel simulation-lab ${compact ? "compact" : ""}`}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">SCENARIO SIMULATION</p>
          <h3>ทดลองผลกระทบก่อนตัดสินใจ</h3>
        </div>
        <span className="status-pill">ไม่เขียนกลับฐานข้อมูล</span>
      </div>
      <div className="simulation-body">
        <div className="scenario-controls">
          <SliderControl label="ราคาขาย" value={priceLift} min={-5} max={10} step={0.1} suffix="%" onChange={setPriceLift} />
          <SliderControl label="COGS" value={cogsLift} min={-5} max={10} step={0.1} suffix="%" onChange={setCogsLift} />
          <SliderControl label="Volume" value={volumeLift} min={-10} max={15} step={0.5} suffix="%" onChange={setVolumeLift} />
          <button
            className="reject reset-scenario"
            onClick={() => {
              setPriceLift(0.5);
              setCogsLift(2);
              setVolumeLift(0);
            }}
          >
            Reset scenario
          </button>
        </div>
        <div className="scenario-results">
          <div><span>ยอดขายฐาน</span><strong>{money(simulation.revenue)}</strong><small>{money(simulation.quantity)} ชิ้น</small></div>
          <div><span>ยอดขายจำลอง</span><strong>{money(simulation.simulatedRevenue)}</strong><small className={simulation.revenueDelta >= 0 ? "positive" : "negative"}>{simulation.revenueDelta >= 0 ? "+" : ""}{money(simulation.revenueDelta)}</small></div>
          <div><span>GP จำลอง</span><strong>{money(simulation.simulatedGp)}</strong><small className={simulation.gpDelta >= 0 ? "positive" : "negative"}>{simulation.gpDelta >= 0 ? "+" : ""}{money(simulation.gpDelta)}</small></div>
          <div><span>Margin จำลอง</span><strong>{simulation.margin.toFixed(1)}%</strong><small>ใช้ COGS baseline 72% จนกว่าจะมี Cost จริง</small></div>
        </div>
      </div>
    </article>
  );
}

function SliderControl({
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}) {
  return (
    <label className="slider-control">
      <span><b>{label}</b><strong>{value > 0 ? "+" : ""}{value.toFixed(step < 1 ? 1 : 0)}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ScenarioDashboardCard({
  delta,
  deltaLabel,
  detail,
  money,
  status,
  title,
  unit = "THB",
  value,
}: {
  delta: number;
  deltaLabel?: string;
  detail: string;
  money: (value: number) => string;
  status: string;
  title: string;
  unit?: string;
  value: number;
}) {
  const isWaiting = status === "WAITING DATA";
  return (
    <article className={`panel scenario-dashboard-card ${isWaiting ? "waiting" : ""}`}>
      <div className="panel-head">
        <div><p className="eyebrow">{status}</p><h3>{title}</h3></div>
      </div>
      <strong>{unit === "THB" ? money(value) : `${money(value)} ${unit}`}</strong>
      <small className={delta >= 0 ? "positive" : "negative"}>{deltaLabel ?? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}</small>
      <p>{detail}</p>
    </article>
  );
}

function DashboardModuleCard({
  labels,
  detail,
  number,
  onOpen,
  status,
  sub,
  title,
  value,
  values,
  xAxis,
  yAxis,
  unit,
}: ModuleCard & {
  onOpen: () => void;
}) {
  const max = Math.max(...values.map((item) => Math.abs(Number(item) || 0)), 1);
  const mode = status === "LIVE" ? "live" : "model";
  return (
    <article className={`module-card ${mode}`}>
      <span>{number}</span><b>{status}</b>
      <h4>{title}</h4>
      <div className="module-spark" role="img" aria-label={`${yAxis} แยกตาม ${xAxis}`}>
        {values.slice(-12).map((item, index) => (
          <i
            key={`${number}-${index}`}
            title={`${labels.slice(-12)[index] ?? index + 1}: ${money(item)} ${unit}`}
            style={{ height: `${Math.max((Math.abs(item) / max) * 100, 6)}%` }}
          />
        ))}
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
      <p>{detail}</p>
      <button className="module-open" onClick={onOpen}>เปิดดูรายละเอียด</button>
    </article>
  );
}

function ModuleDetailModal({
  card,
  money,
  onClose,
}: {
  card: ModuleCard;
  money: (value: number) => string;
  onClose: () => void;
}) {
  const [scenarioValues, setScenarioValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(card.simulationAxes.map((axis) => [axis.key, axis.defaultValue])),
  );
  const scenarioFactor = card.simulationAxes.reduce((factor, axis) => {
    const value = scenarioValues[axis.key] ?? 0;
    const negativeImpact = ["cogs", "discount", "risk", "shrinkage", "writeoff", "leadtime", "cancellation"].includes(axis.key);
    return factor * (1 + (negativeImpact ? -value : value) / 100);
  }, 1);
  const simulatedValues = card.values.map((value) => value * Math.max(0, scenarioFactor));
  const baselineTotal = card.values.reduce((sum, value) => sum + value, 0);
  const simulatedTotal = simulatedValues.reduce((sum, value) => sum + value, 0);
  return (
    <div className="module-modal-backdrop" role="dialog" aria-modal="true" aria-label={card.title}>
      <article className="module-modal">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{card.status} MODULE {card.number}</p>
            <h3>{card.title}</h3>
          </div>
          <button className="reject" onClick={onClose}>ปิด</button>
        </div>
        <div className="module-chart-meta">
          <span><b>แกน X</b>{card.xAxis}</span>
          <span><b>แกน Y</b>{card.yAxis} ({card.unit})</span>
          <span><b>ข้อมูล</b>{card.labels.length} จุด</span>
        </div>
        <ReadableBarChart
          labels={card.labels}
          baseline={card.values}
          scenario={simulatedValues}
          unit={card.unit}
          xAxis={card.xAxis}
          yAxis={card.yAxis}
          money={money}
        />
        <div className="module-detail-grid">
          <div className="module-simulation">
            <div className="panel-head">
              <div><p className="eyebrow">MODULE SIMULATION</p><h4>ปรับสมมติฐานของ {card.title}</h4></div>
              <button className="module-open" onClick={() => setScenarioValues(Object.fromEntries(card.simulationAxes.map((axis) => [axis.key, axis.defaultValue])))}>คืนค่าเริ่มต้น</button>
            </div>
            <div className="module-simulation-controls">
              {card.simulationAxes.map((axis) => (
                <SliderControl
                  key={axis.key}
                  label={axis.label}
                  min={axis.min}
                  max={axis.max}
                  step={axis.step}
                  suffix={axis.unit}
                  value={scenarioValues[axis.key] ?? axis.defaultValue}
                  onChange={(value) => setScenarioValues((current) => ({ ...current, [axis.key]: value }))}
                />
              ))}
            </div>
          </div>
          <div className="module-modal-summary">
            <span>ค่าปัจจุบัน</span>
            <strong>{card.value}</strong>
            <small>{card.sub}</small>
            <dl>
              <div><dt>ผลรวมฐาน</dt><dd>{money(baselineTotal)} {card.unit}</dd></div>
              <div><dt>ผลรวมจำลอง</dt><dd>{money(simulatedTotal)} {card.unit}</dd></div>
              <div><dt>ผลต่าง</dt><dd className={simulatedTotal >= baselineTotal ? "positive" : "negative"}>{simulatedTotal >= baselineTotal ? "+" : ""}{money(simulatedTotal - baselineTotal)} {card.unit}</dd></div>
            </dl>
            <p>{card.detail}</p>
          </div>
        </div>
      </article>
    </div>
  );
}

function DailySalesChart({
  money,
  rows,
}: {
  money: (value: number) => string;
  rows: DashboardData["trend"];
}) {
  const visible = rows.slice(-30);
  if (visible.length === 0) {
    return <div className="chart-empty">ยังไม่มีข้อมูลยอดขายรายวัน</div>;
  }

  const values = visible.map((row) => Number(row.net_amount) || 0);
  const max = Math.max(...values, 1);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const left = 76;
  const top = 22;
  const width = 800;
  const height = 220;
  const x = (index: number) => left + (index / Math.max(visible.length - 1, 1)) * width;
  const y = (value: number) => top + height - (value / max) * height;
  const linePath = visible.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(Number(row.net_amount) || 0)}`).join(" ");
  const areaPath = `${linePath} L ${x(visible.length - 1)} ${top + height} L ${left} ${top + height} Z`;
  const tickIndexes = Array.from(new Set([0, Math.floor((visible.length - 1) / 2), visible.length - 1]));

  return (
    <figure className="daily-sales-chart">
      <figcaption>
        <span><b>{visible.length} วันล่าสุด</b>{visible[0]?.sales_date} ถึง {visible.at(-1)?.sales_date}</span>
        <span>เฉลี่ย <b>{money(average)} บาท/วัน</b></span>
      </figcaption>
      <svg viewBox="0 0 920 300" role="img" aria-label="กราฟยอดขายสุทธิรายวัน 30 วันล่าสุด">
        <title>ยอดขายสุทธิรายวัน 30 วันล่าสุด</title>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const tickY = top + height - tick * height;
          return (
            <g key={tick}>
              <line className="grid-line" x1={left} x2={left + width} y1={tickY} y2={tickY} />
              <text x={left - 10} y={tickY + 4} textAnchor="end">{money(max * tick)}</text>
            </g>
          );
        })}
        <line className="average-line" x1={left} x2={left + width} y1={y(average)} y2={y(average)} />
        <text className="average-label" x={left + width - 4} y={y(average) - 6} textAnchor="end">ค่าเฉลี่ย {money(average)}</text>
        <path className="sales-area" d={areaPath} />
        <path className="sales-line" d={linePath} />
        {visible.map((row, index) => (
          <circle key={row.sales_date} className="sales-point" cx={x(index)} cy={y(Number(row.net_amount) || 0)} r="4">
            <title>{`${row.sales_date}: ${money(row.net_amount)} บาท · ${money(row.net_qty)} ชิ้น`}</title>
          </circle>
        ))}
        {tickIndexes.map((index) => (
          <text key={visible[index].sales_date} className="x-tick" x={x(index)} y={top + height + 22} textAnchor={index === 0 ? "start" : index === visible.length - 1 ? "end" : "middle"}>
            {visible[index].sales_date}
          </text>
        ))}
        <text className="axis-title" x={left + width / 2} y="292" textAnchor="middle">วันที่ขาย</text>
        <text className="axis-title" x="16" y={top + height / 2} textAnchor="middle" transform={`rotate(-90 16 ${top + height / 2})`}>ยอดขายสุทธิ (บาท)</text>
      </svg>
    </figure>
  );
}

function ReadableBarChart({
  baseline,
  labels,
  money,
  scenario,
  unit,
  xAxis,
  yAxis,
}: {
  baseline: number[];
  labels: string[];
  money: (value: number) => string;
  scenario: number[];
  unit: string;
  xAxis: string;
  yAxis: string;
}) {
  const count = Math.min(baseline.length, 16);
  const base = baseline.slice(-count);
  const simulated = scenario.slice(-count);
  const visibleLabels = labels.slice(-count);
  const max = Math.max(...base, ...simulated, 1);
  const left = 86;
  const top = 22;
  const width = 760;
  const height = 250;
  const groupWidth = count ? width / count : width;
  const barWidth = Math.max(4, Math.min(18, groupWidth * 0.28));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <figure className="readable-chart">
      <div className="chart-legend"><span><i className="baseline" />ข้อมูลจริง</span><span><i className="scenario" />ค่าจำลอง</span></div>
      <svg viewBox="0 0 900 350" role="img" aria-label={`${yAxis} ตาม ${xAxis}`}>
        <title>{`${yAxis} ตาม ${xAxis}`}</title>
        {ticks.map((tick) => {
          const y = top + height - tick * height;
          return <g key={tick}><line x1={left} x2={left + width} y1={y} y2={y} className="grid-line" /><text x={left - 10} y={y + 4} textAnchor="end">{money(max * tick)}</text></g>;
        })}
        <line x1={left} x2={left} y1={top} y2={top + height} className="axis-line" />
        <line x1={left} x2={left + width} y1={top + height} y2={top + height} className="axis-line" />
        {base.map((value, index) => {
          const x = left + index * groupWidth + groupWidth / 2;
          const baseHeight = (Math.max(0, value) / max) * height;
          const scenarioHeight = (Math.max(0, simulated[index] ?? value) / max) * height;
          const label = visibleLabels[index] || `จุด ${index + 1}`;
          return (
            <g key={`${label}-${index}`}>
              <rect className="bar-baseline" x={x - barWidth - 1} y={top + height - baseHeight} width={barWidth} height={baseHeight}><title>{`${label} · ข้อมูลจริง ${money(value)} ${unit}`}</title></rect>
              <rect className="bar-scenario" x={x + 1} y={top + height - scenarioHeight} width={barWidth} height={scenarioHeight}><title>{`${label} · ค่าจำลอง ${money(simulated[index] ?? value)} ${unit}`}</title></rect>
              <text className="x-tick" x={x} y={top + height + 19} textAnchor="end" transform={`rotate(-35 ${x} ${top + height + 19})`}>{label.length > 14 ? `${label.slice(0, 12)}…` : label}</text>
            </g>
          );
        })}
        <text className="axis-title" x={left + width / 2} y={342} textAnchor="middle">{xAxis}</text>
        <text className="axis-title" x={18} y={top + height / 2} textAnchor="middle" transform={`rotate(-90 18 ${top + height / 2})`}>{yAxis} ({unit})</text>
      </svg>
    </figure>
  );
}

function UserEditor({
  draft,
  isNew,
  onCancel,
  onChange,
  onSave,
}: {
  draft: UserDraft;
  isNew: boolean;
  onCancel: () => void;
  onChange: (draft: UserDraft) => void;
  onSave: () => void;
}) {
  const update = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="module-modal-backdrop" role="dialog" aria-modal="true" aria-label={isNew ? "เพิ่มผู้ใช้" : "แก้ไขผู้ใช้"}>
      <article className="user-editor">
        <div className="panel-head">
          <div><p className="eyebrow">USER PROFILE</p><h3>{isNew ? "เพิ่มผู้ใช้ใหม่" : `แก้ไข ${draft.display_name || draft.email}`}</h3></div>
          <button className="reject" onClick={onCancel}>ปิด</button>
        </div>
        <div className="user-editor-grid">
          <label><span>ชื่อที่แสดง</span><input value={draft.display_name} onChange={(event) => update("display_name", event.target.value)} placeholder="ชื่อ นามสกุล" /></label>
          <label><span>Username</span><input value={draft.username} onChange={(event) => update("username", event.target.value.toLowerCase())} placeholder="เช่น chaiwat.n" /><small>ใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง</small></label>
          <label><span>อีเมล</span><input type="email" disabled={!isNew} value={draft.email} onChange={(event) => update("email", event.target.value)} placeholder="name@company.com" /></label>
          <label><span>แผนก</span><input value={draft.department} onChange={(event) => update("department", event.target.value)} placeholder="เช่น Sales, IT, Finance" /></label>
          <label><span>ตำแหน่ง</span><input value={draft.job_title} onChange={(event) => update("job_title", event.target.value)} placeholder="เช่น Manager, Analyst" /></label>
          <label><span>Role</span><select value={draft.role} onChange={(event) => update("role", event.target.value as Role)}><option value="ADMINISTRATOR">Administrator</option><option value="SALE_ADMIN">Sale Admin</option><option value="USER">User</option></select></label>
          <label><span>วิธีเข้าสู่ระบบ</span><select value={draft.auth_source} onChange={(event) => update("auth_source", event.target.value as UserDraft["auth_source"])}><option value="ACTIVE_DIRECTORY">Windows Active Directory</option><option value="LOCAL">Local account</option></select></label>
          <label><span>สถานะ</span><select value={draft.status} onChange={(event) => update("status", event.target.value as UserDraft["status"])}><option value="ACTIVE">ใช้งานอยู่</option><option value="SUSPENDED">ระงับใช้งาน</option></select></label>
        </div>
        <div className="editor-note">ระบบใช้ Role ร่วมกับ Authorize Matrix และจะไม่จัดเก็บรหัสผ่าน Active Directory ไว้ใน ESIP</div>
        <div className="editor-actions"><button className="reject" onClick={onCancel}>ยกเลิก</button><button className="approve" onClick={onSave}>บันทึกข้อมูล</button></div>
      </article>
    </div>
  );
}

function SourceStatusBoard({
  detailed = false,
  imports,
  money,
  rows,
  sourceStatus,
}: {
  detailed?: boolean;
  imports: ImportCenterData | null;
  money: (value: number) => string;
  rows: DashboardData["source_sales"];
  sourceStatus: NonNullable<DashboardData["source_status"]>;
}) {
  const pendingBySource = new Map<string, number>();
  for (const file of imports?.pending_files ?? []) {
    const keys = file.source === "HP_MH" ? ["HP", "MH"] : [file.source];
    for (const key of keys) pendingBySource.set(key, (pendingBySource.get(key) ?? 0) + 1);
  }
  const today = new Date();
  return (
    <article className={`panel source-status-board ${detailed ? "detailed" : ""}`}>
      <div className="panel-head">
        <div><p className="eyebrow">RAW DATA STATUS</p><h3>ข้อมูลเข้าระบบถึงวันที่เท่าไร</h3></div>
        <span className="status-pill">{imports?.scheduler.enabled ? `AUTO ${imports.scheduler.time}` : "MANUAL"}</span>
      </div>
      <div className="raw-status-table">
        <div className="raw-status-head">
          <span>MT</span><span>Sales ล่าสุด</span><span>Inventory ล่าสุด</span><span>Lag</span><span>วันในระบบ</span><span>Pending</span>{detailed && <><span>Local path</span><span>NAS path</span></>}
        </div>
        {rawSourcePaths.map((source) => {
          const row = rows.find((item) => item.source_code === source.code);
          const sourceRow = sourceStatus.find((item) => item.source_code === source.code);
          const latestSales = sourceRow?.latest_sales_date ?? row?.last_date ?? null;
          const latestInventory = sourceRow?.latest_inventory_date ?? null;
          const latest = latestSales ?? latestInventory;
          const lagDays = typeof sourceRow?.sales_days_behind === "number"
            ? Math.max(0, sourceRow.sales_days_behind)
            : latest
              ? Math.max(0, Math.round((today.getTime() - new Date(`${latest}T00:00:00`).getTime()) / 86400000))
              : null;
          const availableDays = Number(row?.available_days ?? 0);
          const status = !latest ? "waiting" : lagDays !== null && lagDays <= 2 ? "ready" : "lagging";
          return (
            <div className={`raw-status-row ${status}`} key={source.code}>
              <span><b className="source-logo mini">{source.code}</b><strong>{source.name}</strong></span>
              <span>{latestSales ?? "รอข้อมูล"}</span>
              <span>{latestInventory ?? "รอข้อมูล"}</span>
              <span className={`source-status ${status}`}>{lagDays === null ? "WAITING" : `${lagDays} DAYS`}</span>
              <span>{availableDays > 0 ? `${availableDays} วัน` : "0 วัน"}</span>
              <span>{money(pendingBySource.get(source.code) ?? 0)} ไฟล์</span>
              {detailed && <><code>{source.local}</code><code>{source.nas}</code></>}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function AuthorizationMatrix({
  dirty,
  onChange,
  permissions,
}: {
  dirty: boolean;
  onChange: (role: Role, menuId: PageId, canView: boolean) => void;
  permissions: PermissionMatrix;
}) {
  return (
    <article className="panel authorization-matrix">
      <div className="panel-head"><div><p className="eyebrow">ACCESS BY USER GROUP</p><h3>สิทธิ์การเห็นเมนูราย Role</h3></div><span className="status-pill">{dirty ? "UNSAVED CHANGES" : "SAVED"}</span></div>
      <div className="auth-table">
        <div className="auth-head"><span>Module</span><span>Administrator</span><span>Sale Admin</span><span>User</span></div>
        {nav.map(([menuId, label]) => (
          <div key={menuId}>
            <strong>{label}</strong>
            {(["ADMINISTRATOR", "SALE_ADMIN", "USER"] as const).map((role) => {
              const locked = role === "ADMINISTRATOR" && menuId === "authorize";
              return (
                <label className="permission-toggle" key={`${role}-${menuId}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(permissions[role]?.[menuId])}
                    disabled={locked}
                    onChange={(event) => onChange(role, menuId, event.target.checked)}
                  />
                  <span>{permissions[role]?.[menuId] ? "View" : "No access"}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </article>
  );
}
