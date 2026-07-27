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
  data_quality: Array<{ source_code: string; issue: string; affected_rows: number }>;
  reference_coverage: Array<{ report: string; status: string; note: string }>;
  approval_queue_total?: number;
  publication_queue_total?: number;
  generated_at?: string;
};

type UserRow = { email: string; role: Role; created_at: string };
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
  ["dashboard", "เธ เธฒเธเธฃเธงเธก"],
  ["reports", "เธฃเธฒเธขเธเธฒเธ Sale Out"],
  ["simulations", "Simulation Lab"],
  ["imports", "เธเธณเน€เธเนเธฒเธเนเธญเธกเธนเธฅ"],
  ["confirm", "Admin Confirm"],
  ["sources", "เนเธซเธฅเนเธเธเนเธญเธกเธนเธฅ"],
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
  EXACT_ITEM_MASTER_BARCODE: "Barcode เธ•เธฃเธเธเธฑเธ Item Master เธเธญเธ SAP",
  UNIQUE_CROSS_SOURCE_OSCN: "เธเธเธฃเธซเธฑเธช OSCN เธ—เธตเนเธ•เธฃเธเธเธฑเธเน€เธเธตเธขเธเธฃเธฒเธขเธเธฒเธฃเน€เธ”เธตเธขเธงเธเธฒเธเนเธซเธฅเนเธเธญเธทเนเธ",
  EXACT_OSCN: "เธฃเธซเธฑเธชเธ•เธฃเธเธเธฑเธเธเนเธญเธกเธนเธฅ OSCN",
  EXACT_BRANCH_CODE: "เธฃเธซเธฑเธชเธชเธฒเธเธฒเธ•เธฃเธเธเธฑเธ Branch Master",
  NAME_MATCH: "เธเธทเนเธญเธชเธฒเธเธฒเธ•เธฃเธเธซเธฃเธทเธญเนเธเธฅเนเน€เธเธตเธขเธเธเธฑเธ Branch Master",
  SOURCE_BRANCH_NAME: "เธฃเธฐเธเธเน€เธ—เธตเธขเธเธเธฒเธเธเธทเนเธญเธชเธฒเธเธฒเธ—เธตเนเธญเธขเธนเนเนเธเนเธเธฅเนเธ•เนเธเธ—เธฒเธ",
};

const priorityLabels: Record<string, string> = {
  P1: "เธชเธณเธเธฑเธเธกเธฒเธ",
  P2: "เธเธงเธฃเธ•เธฃเธงเธ",
  P3: "เธ•เธฃเธงเธเธ•เธฒเธกเธฅเธณเธ”เธฑเธ",
  P4: "เธเนเธญเธกเธนเธฅเธเธฃเธฐเธเธญเธ",
};

const rawSourcePaths = [
  { code: "DH", name: "DoHome", local: "D:\\Python\\ESIP\\SourceFiles\\DH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\DH" },
  { code: "GBH", name: "Global House", local: "D:\\Python\\ESIP\\SourceFiles\\GBH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\GBH" },
  { code: "HH", name: "HomeHub", local: "D:\\Python\\ESIP\\SourceFiles\\HH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\HomeHub" },
  { code: "HP", name: "HomePro", local: "D:\\Python\\ESIP\\SourceFiles\\HP_MH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\HP_MH" },
  { code: "MH", name: "Mega Home", local: "D:\\Python\\ESIP\\SourceFiles\\HP_MH\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\HP_MH" },
  { code: "TWD", name: "Thai Watsadu", local: "D:\\Python\\ESIP\\SourceFiles\\TWD\\incoming", nas: "\\\\wa-nas-it03\\FileShare-2\\SaleOut_RPT\\TWD" },
  { code: "TA", name: "Thai Aus", local: "D:\\Python\\ESIP\\SourceFiles\\TA\\incoming", nas: "เธฃเธญเน€เธเธดเธ”เนเธเนเธเธฒเธเน€เธกเธทเนเธญเธกเธต Daily Raw เธเธธเธ”เนเธฃเธ" },
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
  const [permissions, setPermissions] = useState<PermissionMatrix>(defaultPermissions);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>("USER");
  const [imports, setImports] = useState<ImportCenterData | null>(null);
  const [importSource, setImportSource] = useState("AUTO");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [importWorking, setImportWorking] = useState(false);
  const [priceLift, setPriceLift] = useState(0.5);
  const [cogsLift, setCogsLift] = useState(2);
  const [volumeLift, setVolumeLift] = useState(0);

  const bridgeHeaders = {
    "content-type": "application/json",
    authorization: "Bearer esip-local-apply-token",
  };

  const loadDashboardData = useCallback(async () => {
    const dataResponse = await fetch("http://localhost:8090/data", { cache: "no-store" });
    const dashboardPayload = (await dataResponse.json()) as DashboardData & { error?: string };
    if (!dataResponse.ok) throw new Error(dashboardPayload.error ?? "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธฃเธฒเธขเธเธฒเธเนเธกเนเนเธ”เน");
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
    const queuePayload = (await queueResponse.json()) as {
      items?: Confirmation[];
      total?: number;
      error?: string;
    };
    const auditPayload = (await auditResponse.json()) as {
      events?: AuditEvent[];
      error?: string;
    };
    if (!queueResponse.ok) throw new Error(queuePayload.error ?? "เนเธซเธฅเธ”เธเธดเธงเนเธกเนเนเธ”เน");
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
      .then(async (response) => (await response.json()) as ApiPayload)
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
        setMessage(error instanceof Error ? error.message : "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ ESIP เนเธกเนเนเธ”เน"),
      )
      .finally(() => setLoading(false));
  }, [loadDashboardData, localRole]);

  useEffect(() => {
    if (auth?.mode !== "LOCAL_TRIAL") return;
    if (active !== "confirm" && active !== "audit") return;
    const timer = window.setTimeout(() => {
      loadQueueData().catch((error) =>
        setMessage(error instanceof Error ? error.message : "เนเธซเธฅเธ”เธเธดเธงเนเธกเนเธชเธณเน€เธฃเนเธ"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, auth?.mode, loadQueueData]);

  useEffect(() => {
    if (auth?.role !== "ADMINISTRATOR") return;
    fetch("/api/users", { headers: { "x-esip-local-role": localRole } })
      .then(async (response) => {
        const payload = (await response.json()) as { users?: UserRow[] };
        if (response.ok) setUsers(payload.users ?? []);
      })
      .catch(() => undefined);
  }, [auth?.role, localRole]);

  useEffect(() => {
    if (!auth) return;
    fetch("/api/permissions", { headers: { "x-esip-local-role": localRole } })
      .then(async (response) => {
        const payload = (await response.json()) as { permissions?: PermissionMatrix };
        if (response.ok && payload.permissions) setPermissions(payload.permissions);
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
    const response = await fetch("http://localhost:8090/imports", { cache: "no-store" });
    const payload = (await response.json()) as ImportCenterData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ Import Center เนเธกเนเนเธ”เน");
    setImports(payload);
  }, []);

  useEffect(() => {
    if ((active === "imports" || active === "sources") && auth?.role !== "USER") {
      const timer = window.setTimeout(() => {
        loadImports().catch((error) => setMessage(error instanceof Error ? error.message : "เนเธซเธฅเธ” Import Center เนเธกเนเนเธ”เน"));
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
      if (!response.ok) throw new Error(payload.error ?? "Process เนเธกเนเธชเธณเน€เธฃเนเธ");
      await Promise.all([loadImports(), loadDashboardData(), loadQueueData()]);
      setMessage(payload.status === "PASS" ? "Process เธเนเธญเธกเธนเธฅเธชเธณเน€เธฃเนเธ Dashboard เธญเธฑเธเน€เธ”เธ•เนเธฅเนเธง" : "Process เธซเธขเธธเธ”เน€เธเธฃเธฒเธฐเธเธเธเนเธญเธเธดเธ”เธเธฅเธฒเธ” เธเธฃเธธเธ“เธฒเธ”เธนเธเธฃเธฐเธงเธฑเธ•เธดเธ”เนเธฒเธเธฅเนเธฒเธ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Process เนเธกเนเธชเธณเน€เธฃเนเธ");
    } finally {
      setImportWorking(false);
    }
  }

  async function uploadAndProcess(processImmediately: boolean) {
    if (uploadFiles.length === 0) {
      setMessage("เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเนเธเธฅเนเธญเธขเนเธฒเธเธเนเธญเธข 1 เนเธเธฅเน");
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
        if (!response.ok) throw new Error(payload.error ?? `Upload ${file.name} เนเธกเนเธชเธณเน€เธฃเนเธ`);
      }
      setUploadFiles([]);
      if (processImmediately) {
        setImportWorking(false);
        await processImports("UPLOAD_AND_PROCESS");
      } else {
        await loadImports();
        setMessage(`เธเธณ ${fileCount} เนเธเธฅเนเนเธเธงเธฒเธเนเธเธเธทเนเธเธ—เธตเนเธฃเธญเธเธฃเธฐเธกเธงเธฅเธเธฅเนเธฅเนเธง`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เธเธณเน€เธเนเธฒเนเธเธฅเนเนเธกเนเธชเธณเน€เธฃเนเธ");
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
      setMessage("เธเธฃเธธเธ“เธฒเธเธฃเธญเธ Approval Reference เธเนเธญเธ");
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
        if (!response.ok) throw new Error(payload.error ?? "เธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ");
        await loadQueueData();
        setMessage(payload.message ?? "เธเธฑเธเธ—เธถเธเน€เธฃเธตเธขเธเธฃเนเธญเธข");
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
        if (!response.ok) throw new Error(payload.error ?? "เธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ");
        setAuth(payload);
        setQueue(payload.confirmations);
        setAudit(payload.audit);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”");
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

  async function saveUser() {
    const email = newUserEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setMessage("เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธญเธตเน€เธกเธฅเนเธซเนเธ–เธนเธเธ•เนเธญเธ");
      return;
    }
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-esip-local-role": localRole,
      },
      body: JSON.stringify({ email, role: newUserRole }),
    });
    const payload = (await response.json()) as { users?: UserRow[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "เธเธฑเธเธ—เธถเธ Role เนเธกเนเธชเธณเน€เธฃเนเธ");
      return;
    }
    setUsers(payload.users ?? []);
    setNewUserEmail("");
    setMessage("เธเธฑเธเธ—เธถเธ Role เนเธฅเนเธง");
  }

  async function savePermission(role: Role, menuId: PageId, canView: boolean) {
    const next = {
      ...permissions,
      [role]: { ...permissions[role], [menuId]: canView },
    };
    setPermissions(next);
    const response = await fetch("/api/permissions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-esip-local-role": localRole,
      },
      body: JSON.stringify({ role, menuId, canView }),
    });
    const payload = (await response.json()) as { permissions?: PermissionMatrix; error?: string };
    if (!response.ok) {
      setPermissions(permissions);
      setMessage(payload.error ?? "เธเธฑเธเธ—เธถเธเธชเธดเธ—เธเธดเนเนเธกเนเธชเธณเน€เธฃเนเธ");
      return;
    }
    if (payload.permissions) setPermissions(payload.permissions);
    setMessage("เธเธฑเธเธ—เธถเธเธชเธดเธ—เธเธดเนเน€เธกเธเธนเนเธฅเนเธง");
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
  const productValues = (dashboard?.top_products ?? []).slice(0, 8).map((row) => Number(row.net_amount) || 0);
  const branchValues = (dashboard?.top_branches ?? []).slice(0, 8).map((row) => Number(row.net_amount) || 0);
  const inventoryValues = (dashboard?.inventory ?? []).map((row) => Number(row.onhand_qty) || 0);
  const moduleCards = [
    { number: "01", title: "Executive Summary", status: "LIVE", detail: `${money(coverage?.sales_amount ?? 0)} sales`, values: recentTrend, value: money(latestDay?.net_amount ?? 0), sub: latestDay?.sales_date ?? "waiting" },
    { number: "02", title: "Sales Performance", status: "LIVE", detail: "Daily / MTD trend and MT comparison", values: recentTrend, value: `${trend.length} days`, sub: `${dailyChange === null ? "N/A" : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(1)}%`} vs prior day` },
    { number: "03", title: "Product Intelligence", status: "LIVE", detail: "Top SKU, Product Mix and Mapping", values: productValues, value: money(dashboard?.top_products?.[0]?.net_amount ?? 0), sub: dashboard?.top_products?.[0]?.sap_item_code ?? "Top SKU" },
    { number: "04", title: "Branch Intelligence", status: "LIVE", detail: "Top Branch and branch performance", values: branchValues, value: money(dashboard?.top_branches?.[0]?.net_amount ?? 0), sub: dashboard?.top_branches?.[0]?.branch_source_name ?? "Top branch" },
    { number: "05", title: "Inventory Control", status: "LIVE", detail: "On Hand, Stock Value and freshness", values: inventoryValues, value: money(inventoryTotal), sub: `${dashboard?.inventory?.length ?? 0} MT snapshots` },
    { number: "06", title: "Target Achievement", status: "SIM", detail: "Actual, target uplift, gap and %achievement", values: recentTrend.map((value) => value * (1 + priceLift / 100)), value: `${(100 + priceLift + volumeLift).toFixed(1)}%`, sub: "scenario target model" },
    { number: "07", title: "Forecast & Run Rate", status: "SIM", detail: "Month-end run rate and trend assumption", values: recentTrend.map((value) => value * (1 + volumeLift / 100)), value: money((latestDay?.net_amount ?? 0) * 30), sub: "latest-day run rate" },
    { number: "08", title: "Gross Profit", status: "SIM", detail: "GP, margin and COGS assumption", values: recentTrend.map((value) => value * (0.28 - cogsLift / 100)), value: `${simulation.margin.toFixed(1)}%`, sub: `${money(simulation.simulatedGp)} GP` },
    { number: "09", title: "YoY Comparison", status: "LIVE", detail: "2025 vs 2026 where dates overlap", values: recentTrend, value: coverage?.first_date?.startsWith("2025") ? "READY" : "WAIT", sub: "loaded history starts 2025" },
    { number: "10", title: "Stock Aging", status: "SIM", detail: "Aging bucket and slow-moving proxy", values: inventoryValues.map((value) => value * (1 - volumeLift / 100)), value: money(inventoryTotal * Math.max(0, volumeLift) / 100), sub: "demand-driven proxy" },
    { number: "11", title: "On Order & Supply", status: "SIM", detail: "PO, on order and supply uplift assumption", values: inventoryValues.map((value) => value * (1 + cogsLift / 100)), value: money(inventoryTotal * Math.max(0, cogsLift) / 100), sub: "supply assumption" },
    { number: "12", title: "Data Quality Center", status: "LIVE", detail: "Freshness, missing amount and approval queue", values: [dashboard?.data_quality.length ?? 0, queueTotal, dashboard?.publication_queue_total ?? 0], value: money(queueTotal), sub: "approval queue" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">EI</span>
          <span><strong>ESIP</strong><small>Enterprise Intelligence</small></span>
        </div>
        <nav aria-label="เน€เธกเธเธนเธซเธฅเธฑเธ">
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
          <div><strong>Daily Run: PASS</strong><small>{coverage?.last_date ?? "เธเธณเธฅเธฑเธเนเธซเธฅเธ”"}</small></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div><p className="eyebrow">ONE VERSION OF THE TRUTH</p><h1>{nav.find(([id]) => id === active)?.[1]}</h1></div>
          <div className="topbar-actions">
            <button className="theme-toggle" onClick={switchTheme} aria-label="เธชเธฅเธฑเธ Light/Dark Theme">
              {theme === "dark" ? "โ€ Light" : "โพ Dark"}
            </button>
            {auth?.mode === "LOCAL_TRIAL" && (
              <label className="role-switcher">
                <span>เธ—เธ”เธฅเธญเธ Role</span>
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
                <h2>เธเนเธญเธกเธนเธฅเธ—เธธเธเธงเธฑเธเธ—เธตเนเธกเธต<br />เธ–เธนเธเธเธณเธกเธฒเธฃเธงเธกเนเธฅเนเธง</h2>
                <p className="subtext">
                  เธเนเธงเธเธเนเธญเธกเธนเธฅเธเธฑเธเธเธธเธเธฑเธ {coverage?.first_date ?? "โ€”"} เธ–เธถเธ {coverage?.last_date ?? "โ€”"} เธฃเธงเธก {coverage?.available_days ?? 0} เธงเธฑเธ
                </p>
              </div>
              <button className="primary" onClick={() => setActive("reports")}>เน€เธเธดเธ”เธฃเธฒเธขเธเธฒเธเธ•เธฒเธก Reference <span>โ’</span></button>
            </div>
            <div className="kpi-grid">
              <article className="kpi"><span>Sales rows</span><strong>{money(coverage?.sales_rows ?? 0)}</strong><small>เธเนเธญเธกเธนเธฅเธ—เธตเนเนเธซเธฅเธ”เน€เธเนเธฒเธฃเธฐเธเธ</small></article>
              <article className="kpi"><span>Sales amount ex.VAT</span><strong>{money(coverage?.sales_amount ?? 0)}</strong><small>เธ—เธธเธเธงเธฑเธเธ—เธตเนเธกเธตเธเนเธญเธกเธนเธฅ</small></article>
              <article className="kpi"><span>Sales quantity</span><strong>{money(coverage?.sales_qty ?? 0)}</strong><small>{coverage?.available_days ?? 0} available days</small></article>
              <article className="kpi warning"><span>Confirm queue</span><strong>{loading ? "โ€”" : money(queueTotal)}</strong><small>เธฃเธฒเธขเธเธฒเธฃเธขเนเธญเธขเธเธฃเธดเธ</small></article>
            </div>
            <div className="dashboard-grid">
              <article className="panel trend-panel">
                <div className="panel-head"><div><p className="eyebrow">DAILY SALES TREND</p><h3>เธขเธญเธ”เธเธฒเธขเธฃเธฒเธขเธงเธฑเธ</h3></div><span className="status-pill">{trend.length} เธงเธฑเธ</span></div>
                <div className="chart">
                  {trend.slice(-20).map((row) => {
                    const max = Math.max(...trend.map((item) => Number(item.net_amount) || 0), 1);
                    return <span key={row.sales_date} title={`${row.sales_date}: ${money(row.net_amount)}`} style={{ height: `${Math.max((row.net_amount / max) * 100, 3)}%` }}><i /></span>;
                  })}
                </div>
                <div className="chart-labels"><span>{trend.at(0)?.sales_date ?? "โ€”"}</span><span>{trend.at(-1)?.sales_date ?? "โ€”"}</span></div>
              </article>
              <article className="panel action-panel">
                <div className="panel-head"><div><p className="eyebrow">REFERENCE COVERAGE</p><h3>เธชเธดเนเธเธ—เธตเนเธ”เธนเนเธ”เนเนเธฅเนเธง</h3></div></div>
                {(dashboard?.reference_coverage ?? []).slice(0, 5).map((item, index) => (
                  <div className="action-row" key={item.report}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.report}</strong><small>{item.note}</small></div><i className={item.status === "AVAILABLE" ? "ready" : "waiting"} /></div>
                ))}
              </article>
            </div>
            <div className="dashboard-section-head">
              <div><p className="eyebrow teal">ENTERPRISE PERFORMANCE MAP</p><h3>เธ เธฒเธเธฃเธงเธกเธ—เธธเธเธกเธดเธ•เธดเธ—เธตเนเธเธนเนเธเธฃเธดเธซเธฒเธฃเธเธงเธฃเน€เธซเนเธ</h3></div>
              <span className="data-scope">ACTUAL DATA ยท {coverage?.first_date ?? "โ€”"} โ’ {coverage?.last_date ?? "โ€”"}</span>
            </div>
            <div className="executive-strip">
              <article><span>เธขเธญเธ”เธเธฒเธขเธงเธฑเธเธฅเนเธฒเธชเธธเธ”</span><strong>{money(latestDay?.net_amount ?? 0)}</strong><small>{latestDay?.sales_date ?? "เธฃเธญเธเนเธญเธกเธนเธฅ"}</small></article>
              <article><span>เน€เธ—เธตเธขเธเธงเธฑเธเธเนเธญเธเธซเธเนเธฒ</span><strong className={dailyChange !== null && dailyChange < 0 ? "negative" : "positive"}>{dailyChange === null ? "N/A" : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(1)}%`}</strong><small>Daily momentum</small></article>
              <article><span>MT เธ—เธตเนเธกเธตเธเนเธญเธกเธนเธฅ</span><strong>{sourceSales.length} / 7</strong><small>TA เธฃเธญ Daily Raw</small></article>
              <article><span>Stock on hand</span><strong>{money(inventoryTotal)}</strong><small>Latest snapshot เธฃเธงเธกเธ—เธธเธ MT</small></article>
              <article><span>Data issues</span><strong>{dashboard?.data_quality.length ?? 0}</strong><small>เธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธ•เนเธญเธเธ•เธฃเธงเธเธชเธญเธ</small></article>
            </div>
            <SourceStatusBoard
              imports={imports}
              money={money}
              rows={dashboard?.source_sales ?? []}
            />
            <div className="intelligence-grid">
              <article className="panel mt-mix">
                <div className="panel-head"><div><p className="eyebrow">MT CONTRIBUTION</p><h3>เธชเธฑเธ”เธชเนเธงเธเธขเธญเธ”เธเธฒเธขเธ•เธฒเธก MT</h3></div><span className="status-pill">LIVE</span></div>
                <div className="mix-list">
                  {sourceSales.map((row) => (
                    <div key={row.source_code}>
                      <span className="source-logo mini">{row.source_code}</span>
                      <span className="mix-name"><strong>{row.source_code}</strong><small>{row.available_days} เธงเธฑเธ ยท {money(row.net_qty)} เธเธดเนเธ</small></span>
                      <span className="mix-track"><i style={{ width: `${Math.max((Number(row.net_amount) / sourceMax) * 100, 2)}%` }} /></span>
                      <b>{money(row.net_amount)}</b>
                    </div>
                  ))}
                </div>
              </article>
              <article className="panel signal-board">
                <div className="panel-head"><div><p className="eyebrow">MANAGEMENT SIGNALS</p><h3>เธชเธฑเธเธเธฒเธ“เธ—เธตเนเธ•เนเธญเธเธ•เธฑเธ”เธชเธดเธเนเธ</h3></div></div>
                <div className="signal-list">
                  <div className="signal live"><span>01</span><div><strong>Sales & Quantity</strong><small>เธเนเธญเธกเธนเธฅเธเธฃเธดเธเธเธฃเนเธญเธกเธงเธดเน€เธเธฃเธฒเธฐเธซเนเธฃเธฒเธขเธงเธฑเธเนเธฅเธฐเธฃเธฒเธข MT</small></div><b>LIVE</b></div>
                  <div className="signal live"><span>02</span><div><strong>Inventory Position</strong><small>เน€เธซเนเธ On Hand เธฅเนเธฒเธชเธธเธ”เธเธญเธเธ—เธธเธ MT เธ—เธตเนเธชเนเธเธเนเธญเธกเธนเธฅ</small></div><b>LIVE</b></div>
                  <div className="signal attention"><span>03</span><div><strong>Mapping Governance</strong><small>{money(queueTotal)} เธฃเธฒเธขเธเธฒเธฃเธฃเธญ Admin Confirm</small></div><b>ACTION</b></div>
                  <div className="signal waiting"><span>04</span><div><strong>Target & Forecast</strong><small>เนเธเธฃเธเธชเธฃเนเธฒเธเธเธฃเนเธญเธก เธฃเธญ Target เนเธฅเธฐ Forecast</small></div><b>WAITING</b></div>
                  <div className="signal waiting"><span>05</span><div><strong>Gross Profit & Margin</strong><small>เนเธเธฃเธเธชเธฃเนเธฒเธเธเธฃเนเธญเธก เธฃเธญ Cost / COGS</small></div><b>WAITING</b></div>
                </div>
              </article>
            </div>
            <div className="dashboard-section-head compact">
              <div><p className="eyebrow">ANALYTICS BLUEPRINT</p><h3>Dashboard Module เธ—เธฑเนเธเธซเธกเธ”</h3></div>
              <small>Module เธ—เธตเนเธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธกเธนเธฅเธเธฐเนเธชเธ”เธ WAITING DATA เนเธ”เธขเนเธกเนเธชเธฃเนเธฒเธเธ•เธฑเธงเน€เธฅเธเธเธณเธฅเธญเธ</small>
            </div>
            <div className="module-grid">
              {moduleCards.map((card) => (
                <DashboardModuleCard key={card.number} {...card} />
              ))}
            </div>
          </section>
        )}

        {active === "simulations" && (
          <section className="page">
            <div className="section-title">
              <div>
                <p className="eyebrow teal">SIMULATION LAB</p>
                <h2>เธ—เธ”เธฅเธญเธเธ•เธฑเธงเน€เธฅเธเนเธขเธเธ•เธฒเธก Dashboard</h2>
                <p className="subtext">เธเธทเนเธเธ—เธตเนเธเธตเนเนเธขเธเธเธฒเธ C-Level Dashboard เนเธ”เธขเน€เธเธเธฒเธฐ เธเธฃเธฑเธเธชเธกเธกเธ•เธดเธเธฒเธเนเธ”เนเนเธ”เธขเนเธกเนเน€เธเธฅเธตเนเธขเธเธเนเธญเธกเธนเธฅเธเธฃเธดเธเนเธฅเธฐเนเธกเนเธเธฃเธฐเธ—เธเธฃเธฒเธขเธเธฒเธเธ—เธตเนเธเธนเนเธเธฃเธดเธซเธฒเธฃเนเธเนเธ”เธนเธเธฃเธฐเธเธณเธงเธฑเธ</p>
              </div>
              <span className="data-scope">BASE ACTUAL โ€ข {coverage?.first_date ?? "โ€”"} โ’ {coverage?.last_date ?? "โ€”"}</span>
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
            <div className="section-title"><div><p className="eyebrow teal">REFERENCE BOOK COVERAGE</p><h2>เธฃเธฒเธขเธเธฒเธ Sale Out</h2><p className="subtext">เนเธเธฃเธเธชเธฃเนเธฒเธเธ•เธฒเธก โ€เธชเธฃเธธเธ Sale Out.xlsxโ€ เนเธฅเธฐ โ€Current Dashboardโ€ เนเธ”เธขเนเธเนเธเนเธญเธกเธนเธฅเธเธฃเธดเธเธ—เธตเนเธกเธตเธญเธขเธนเนเนเธ ESIP</p></div></div>
            <div className="report-grid">
              <ReportTable title="เธขเธญเธ”เธเธฒเธขเนเธขเธ MT" columns={["MT", "เธงเธฑเธเนเธฃเธ", "เธงเธฑเธเธฅเนเธฒเธชเธธเธ”", "เธเธณเธเธงเธเธงเธฑเธ", "QTY", "Amount ex.VAT"]} rows={(dashboard?.source_sales ?? []).map((row) => [row.source_code, row.first_date, row.last_date, row.available_days, money(row.net_qty), money(row.net_amount)])} />
              <ReportTable title="Top 15 เธชเธฒเธเธฒ" columns={["MT", "เธชเธฒเธเธฒ", "QTY", "Amount ex.VAT"]} rows={(dashboard?.top_branches ?? []).map((row) => [row.source_code, row.branch_source_name || "เนเธกเนเธฃเธฐเธเธธ", money(row.net_qty), money(row.net_amount)])} />
              <ReportTable title="Top 15 SKU" columns={["SAP Item", "Source SKU", "QTY", "Amount ex.VAT"]} rows={(dashboard?.top_products ?? []).map((row) => [row.sap_item_code, row.source_sku, money(row.net_qty), money(row.net_amount)])} />
              <ReportTable title="Stock on Hand เธฅเนเธฒเธชเธธเธ”" columns={["MT", "Snapshot", "On Hand QTY", "On Hand Value"]} rows={(dashboard?.inventory ?? []).map((row) => [row.source_code, row.snapshot_date, money(row.onhand_qty), money(row.onhand_value)])} />
            </div>
            <article className="panel coverage-status">
              <div className="panel-head"><div><p className="eyebrow">DELIVERY STATUS</p><h3>เน€เธ—เธตเธขเธเธเธฑเธ Reference Book</h3></div></div>
              {(dashboard?.reference_coverage ?? []).map((item) => (
                <div key={item.report}><strong>{item.report}</strong><span className={item.status === "AVAILABLE" ? "available" : "waiting"}>{item.status}</span><p>{item.note}</p></div>
              ))}
            </article>
            {(dashboard?.data_quality ?? []).length > 0 && (
              <article className="panel coverage-status data-warning">
                <div className="panel-head"><div><p className="eyebrow">DATA QUALITY NOTE</p><h3>เธเนเธญเธกเธนเธฅเธ—เธตเนเธขเธฑเธเธ—เธณเนเธซเนเธฃเธฒเธขเธเธฒเธเนเธกเนเธเธฃเธ</h3></div></div>
                {dashboard?.data_quality.map((item) => (
                  <div key={`${item.source_code}-${item.issue}`}>
                    <strong>{item.source_code}: {item.issue}</strong>
                    <span className="waiting">REVIEW</span>
                    <p>{money(item.affected_rows)} rows โ€” เธ•เธฒเธฃเธฒเธ QTY เนเธเนเนเธ”เน เนเธ•เน Amount เธเธญเธเนเธซเธฅเนเธเธเธตเนเธขเธฑเธเน€เธเนเธเธจเธนเธเธขเน</p>
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
                <h2>เธจเธนเธเธขเนเธเธณเน€เธเนเธฒเธเนเธญเธกเธนเธฅ MT</h2>
                <p className="subtext">เน€เธฅเธทเธญเธเธซเธฅเธฒเธขเนเธเธฅเนเธเธฃเนเธญเธกเธเธฑเธ เนเธซเนเธฃเธฐเธเธเธ•เธฃเธงเธ MT เธเธฒเธเธเธทเนเธญเนเธเธฅเน เธซเธฃเธทเธญเธฃเธฐเธเธธ MT เน€เธญเธ เนเธฅเนเธงเธชเธฑเนเธ Process เธ—เธฑเธเธ—เธตเนเธ”เนเธเธฒเธเธซเธเนเธฒเน€เธ”เธตเธขเธง</p>
              </div>
              <div className="permission ok"><span>โ“</span><div><strong>{roleLabels[auth.role]}</strong><small>UPLOAD & PROCESS</small></div></div>
            </div>
            <div className="import-kpis">
              <article className="kpi"><span>เนเธเธฅเนเนเธเธเธทเนเธเธ—เธตเนเธฃเธฑเธเน€เธเนเธฒ</span><strong>{imports?.pending_files.length ?? 0}</strong><small>{imports?.pending_files.filter((item) => item.pending).length ?? 0} เนเธเธฅเนเนเธซเธกเนเธซเธฅเธฑเธเธฃเธญเธเธฅเนเธฒเธชเธธเธ”</small></article>
              <article className="kpi"><span>Auto schedule</span><strong>{imports?.scheduler.enabled ? imports.scheduler.time : "OFF"}</strong><small>{imports?.scheduler.timezone ?? "Asia/Bangkok"} เธ—เธธเธเธงเธฑเธ</small></article>
              <article className="kpi"><span>Telegram</span><strong>{imports?.scheduler.telegram_configured ? "READY" : "SETUP"}</strong><small>{imports?.scheduler.telegram_configured ? "เนเธเนเธเธเธฅเธซเธฅเธฑเธ Process" : "เธฃเธญ Bot Token เนเธฅเธฐ Chat ID"}</small></article>
              <article className="kpi"><span>Engine</span><strong>{imports?.scheduler.running ? "RUNNING" : "READY"}</strong><small>เธเนเธญเธเธเธฑเธเธเธฒเธฃ Process เธเนเธญเธเธเธฑเธ</small></article>
            </div>
            <div className="import-layout">
              <article className="panel upload-panel">
                <div className="panel-head"><div><p className="eyebrow">MANUAL UPLOAD</p><h3>Browse เธซเธฃเธทเธญเธฅเธฒเธเนเธเธฅเนเธกเธฒเธงเธฒเธ</h3></div><span className="status-pill">250 MB / เนเธเธฅเน</span></div>
                <div className="upload-controls">
                  <label><span>เธเธฒเธฃเธฃเธฐเธเธธ MT</span><select value={importSource} onChange={(event) => setImportSource(event.target.value)}><option value="AUTO">Auto Detect</option>{(imports?.sources ?? ["DH", "GBH", "HH", "HP_MH", "TWD", "TA"]).map((source) => <option value={source} key={source}>{source}</option>)}</select></label>
                  <label className="drop-zone"><input type="file" multiple accept=".xlsx,.xls,.zip,.csv" onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))} /><strong>{uploadFiles.length ? `${uploadFiles.length} เนเธเธฅเนเธเธฃเนเธญเธกเธเธณเน€เธเนเธฒ` : "เน€เธฅเธทเธญเธเนเธเธฅเนเธเธฒเธเน€เธเธฃเธทเนเธญเธ"}</strong><small>{uploadFiles.map((file) => file.name).join(" โ€ข ") || "เธฃเธญเธเธฃเธฑเธ Excel, CSV เนเธฅเธฐ ZIP"}</small></label>
                </div>
                <div className="import-actions"><button className="reject" disabled={importWorking} onClick={() => uploadAndProcess(false)}>เน€เธเนเธเนเธงเนเธฃเธญ Process</button><button className="approve" disabled={importWorking} onClick={() => uploadAndProcess(true)}>{importWorking ? "เธเธณเธฅเธฑเธเธ—เธณเธเธฒเธ..." : "Upload & Process เธ—เธฑเธเธ—เธต"}</button></div>
              </article>
              <article className="panel folder-panel">
                <div className="panel-head"><div><p className="eyebrow">FOLDER INBOX</p><h3>เนเธเธฅเนเธ—เธตเนเธเธณเธกเธฒเธงเธฒเธเนเธงเนเนเธฅเนเธง</h3></div><button className="approve" disabled={importWorking} onClick={() => processImports()}>{importWorking ? "เธเธณเธฅเธฑเธ Process..." : "Process เธ—เธธเธ MT"}</button></div>
                <div className="file-list">
                  {(imports?.pending_files ?? []).slice(0, 12).map((file) => <div key={`${file.source}-${file.filename}`}><span className="source-logo mini">{file.source}</span><span><strong>{file.filename}</strong><small>{file.modified_at} โ€ข {(file.size / 1024 / 1024).toFixed(1)} MB</small></span><b className={file.pending ? "new" : ""}>{file.pending ? "NEW" : "LOADED"}</b></div>)}
                  {(imports?.pending_files.length ?? 0) === 0 && <div className="empty">เธขเธฑเธเนเธกเนเธกเธตเนเธเธฅเนเนเธ Folder incoming</div>}
                </div>
              </article>
            </div>
            <article className="panel import-history">
              <div className="panel-head"><div><p className="eyebrow">PROCESS HISTORY</p><h3>เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเธเธณเน€เธเนเธฒเนเธฅเธฐเธเธฅเธ•เธฃเธงเธเธชเธญเธ</h3></div></div>
              <div className="history-table">
                <div className="history-head"><span>เน€เธงเธฅเธฒ / Run</span><span>เธงเธดเธเธตเธเธณเน€เธเนเธฒ</span><span>เธเธนเนเธ”เธณเน€เธเธดเธเธเธฒเธฃ</span><span>เธเธฅ</span><span>เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”</span></div>
                {(imports?.history ?? []).slice(0, 20).map((event, index) => <div key={`${event.run_id}-${index}`}><span><strong>{event.run_id}</strong><small>{event.finished_at ?? event.started_at ?? ""}</small></span><span>{event.trigger}</span><span>{event.actor || "System"}</span><span className={`run-status ${event.status.toLowerCase()}`}>{event.status}</span><span className="history-detail">{event.filename ? `${event.source}: ${event.filename}` : event.detail || "Completed"}</span></div>)}
              </div>
            </article>
          </section>
        )}

        {active === "confirm" && auth?.canConfirm && (
          <section className="page">
            <div className="section-title">
              <div><p className="eyebrow teal">เธ•เธฃเธงเธเธชเธญเธเธเนเธญเธเน€เธเธทเนเธญเธกเธเนเธญเธกเธนเธฅเน€เธเนเธฒเธเธฑเธ SAP</p><h2>เธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธฃเธญเธเธฒเธฃเธขเธทเธเธขเธฑเธ</h2><p className="subtext">เธฃเธฐเธเธเธเธเธฃเธซเธฑเธชเธชเธดเธเธเนเธฒเธซเธฃเธทเธญเธชเธฒเธเธฒเธ—เธตเนเธเนเธฒเธเธฐเธ•เธฃเธเธเธฑเธ เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธ—เธตเธฅเธฐเธฃเธฒเธขเธเธฒเธฃ เน€เธกเธทเนเธญเธเธ”เธขเธทเธเธขเธฑเธ เธฃเธฐเธเธเธเธฐเนเธเน Mapping เธเธตเนเธเธฑเธเธเนเธญเธกเธนเธฅเธ—เธฑเธเธ—เธต</p></div>
              <div className="permission ok"><span>โ“</span><div><strong>{roleLabels[auth.role]}</strong><small>เธกเธตเธชเธดเธ—เธเธดเนเธขเธทเธเธขเธฑเธเนเธฅเธฐเนเธเนเธเธฒเธ</small></div></div>
            </div>
            <div className="confirm-guide">
              <article><span>1</span><div><strong>เธ•เธฃเธงเธเธเนเธญเธกเธนเธฅเธ•เนเธเธ—เธฒเธ</strong><p>เธ”เธนเธเธทเนเธญ MT เนเธฅเธฐเธฃเธซเธฑเธชเธ—เธตเนเนเธ”เนเธฃเธฑเธเธเธฒเธเนเธเธฅเน</p></div></article>
              <article><span>2</span><div><strong>เธ•เธฃเธงเธเธฃเธซเธฑเธช SAP เธ—เธตเนเธฃเธฐเธเธเนเธเธฐเธเธณ</strong><p>เธ”เธนเน€เธซเธ•เธธเธเธฅเนเธฅเธฐเธเธณเธเธงเธเธเนเธญเธกเธนเธฅเธ—เธตเนเธเธฐเนเธ”เนเธฃเธฑเธเธเธฅ</p></div></article>
              <article><span>3</span><div><strong>เธเธฃเธญเธเธ—เธตเนเธกเธฒเนเธฅเนเธงเธ•เธฑเธ”เธชเธดเธเนเธ</strong><p>เน€เธเนเธ โ€เธ•เธฃเธงเธเนเธ”เธขเธเธธเธ“เธเธฑเธขเธงเธฑเธ’เธเน 24/07/69โ€ เนเธฅเนเธงเธเธ”เธขเธทเธเธขเธฑเธเธซเธฃเธทเธญเธขเธฑเธเนเธกเนเธขเธทเธเธขเธฑเธ</p></div></article>
            </div>
            <div className="queue-tools">
              <select value={queueType} onChange={(event) => setQueueType(event.target.value as typeof queueType)}>
                <option value="all">เธ—เธฑเนเธเธซเธกเธ”: เธชเธดเธเธเนเธฒเนเธฅเธฐเธชเธฒเธเธฒ</option>
                <option value="product">เน€เธเธเธฒเธฐเธฃเธซเธฑเธชเธชเธดเธเธเนเธฒ</option>
                <option value="branch">เน€เธเธเธฒเธฐเธชเธฒเธเธฒ</option>
              </select>
              <input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="เธเนเธเธซเธฒเธเธทเนเธญ MT, เธฃเธซเธฑเธชเธชเธดเธเธเนเธฒ, เธชเธฒเธเธฒ เธซเธฃเธทเธญเธฃเธซเธฑเธช SAP" />
              <span>เธฃเธญเธ•เธฃเธงเธเธ—เธฑเนเธเธซเธกเธ” <strong>{money(queueTotal)}</strong> เธฃเธฒเธขเธเธฒเธฃ</span>
            </div>
            <div className="queue">
              {queue.map((item) => (
                <article className="queue-card" key={item.id}>
                  <div className="queue-meta">
                    <span className={`priority ${item.priority.toLowerCase()}`}>{item.priority} ยท {priorityLabels[item.priority] ?? "เธฃเธญเธ•เธฃเธงเธ"}</span>
                    <span className="category">{item.queue_kind === "BRANCH" ? "เธ•เธฃเธงเธเธชเธฒเธเธฒ" : "เธ•เธฃเธงเธเธฃเธซเธฑเธชเธชเธดเธเธเนเธฒ"}</span>
                    <span className="source">{sourceNames[item.source_code] ?? item.source_code} <small>({item.source_code})</small></span>
                  </div>
                  <div className="queue-content">
                    <div><small>เธฃเธซเธฑเธชเธ—เธตเนเนเธ”เนเธฃเธฑเธเธเธฒเธ {sourceNames[item.source_code] ?? item.source_code}</small><strong>{item.subject}</strong></div>
                    <div><small>เธฃเธซเธฑเธช SAP เธ—เธตเนเธฃเธฐเธเธเนเธเธฐเธเธณ</small><strong>{item.candidate}</strong></div>
                    <div><small>เน€เธซเธ•เธธเธเธฅเธ—เธตเนเนเธเธฐเธเธณ</small><strong>{evidenceLabels[item.evidence] ?? item.evidence.replaceAll("_", " ")}</strong></div>
                    <div><small>เธเนเธญเธกเธนเธฅเธ—เธตเนเธเธฐเนเธ”เนเธฃเธฑเธเธเธฅ</small><strong>{money(item.affected_rows)} เนเธ–เธง</strong></div>
                  </div>
                  <div className="candidate-correction">
                    {!editingCandidate[String(item.id)] ? (
                      <button onClick={() => {
                        setEditingCandidate((old) => ({ ...old, [String(item.id)]: true }));
                        setOverrideCandidate((old) => ({ ...old, [String(item.id)]: item.candidate }));
                      }}>เธฃเธซเธฑเธชเธ—เธตเนเนเธเธฐเธเธณเนเธกเนเธ–เธนเธเธ•เนเธญเธ โ€” เนเธเนเนเธเธฃเธซเธฑเธช SAP</button>
                    ) : (
                      <div className="correction-editor">
                        <div>
                          <label>เธเนเธเธซเธฒเนเธฅเธฐเน€เธฅเธทเธญเธเธฃเธซเธฑเธช SAP เธ—เธตเนเธ–เธนเธเธ•เนเธญเธ</label>
                          <input
                            value={overrideCandidate[String(item.id)] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value.toUpperCase();
                              setOverrideCandidate((old) => ({ ...old, [String(item.id)]: value }));
                              searchMaster(item, value).catch(() => undefined);
                            }}
                            placeholder={item.queue_kind === "BRANCH" ? "เธเธดเธกเธเน CardCode เธซเธฃเธทเธญเธเธทเนเธญเธชเธฒเธเธฒ" : "เธเธดเธกเธเน ItemCode เธซเธฃเธทเธญเธเธทเนเธญเธชเธดเธเธเนเธฒ"}
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
                        }}>เธขเธเน€เธฅเธดเธเธเธฒเธฃเนเธเนเนเธ</button>
                      </div>
                    )}
                    {editingCandidate[String(item.id)] && overrideCandidate[String(item.id)] && overrideCandidate[String(item.id)] !== item.candidate && (
                      <p>เธฃเธฐเธเธเธเธฐเน€เธเธฅเธตเนเธขเธเธเธฒเธ <strong>{item.candidate}</strong> เน€เธเนเธ <strong>{overrideCandidate[String(item.id)]}</strong> เนเธฅเธฐเธ•เธฃเธงเธเธชเธญเธเธเธฑเธ Master เธเนเธญเธเนเธเนเธเธฒเธ</p>
                    )}
                  </div>
                  <div className="decision-bar">
                    <label><span>เธเธฑเธเธ—เธถเธเธงเนเธฒเนเธเธฃเธ•เธฃเธงเธเธซเธฃเธทเธญเธญเนเธฒเธเธญเธดเธเธเธฒเธเธญเธฐเนเธฃ <b>เธเธณเน€เธเนเธเธ•เนเธญเธเธเธฃเธญเธ</b></span><input value={reference[String(item.id)] ?? ""} onChange={(event) => setReference((old) => ({ ...old, [String(item.id)]: event.target.value }))} placeholder="เธ•เธฑเธงเธญเธขเนเธฒเธ: เธ•เธฃเธงเธเนเธ”เธขเธเธธเธ“เธเธฑเธขเธงเธฑเธ’เธเน 24/07/69 เธซเธฃเธทเธญ EMAIL-1234" /></label>
                    <button className="reject" disabled={working === item.id} onClick={() => decide(item, "REJECTED")}>เธขเธฑเธเนเธกเนเธขเธทเธเธขเธฑเธ</button>
                    <button className="approve" disabled={working === item.id} onClick={() => decide(item, "APPROVED")}>{working === item.id ? "เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ..." : "เธขเธทเธเธขเธฑเธเนเธฅเธฐเนเธเนเธเธฒเธเธ—เธฑเธเธ—เธต"}</button>
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
                <h2>เธชเธ–เธฒเธเธฐ RAW Data เนเธขเธเนเธ•เนเธฅเธฐ MT</h2>
                <p className="subtext">เน€เธซเนเธเธ—เธฑเนเธ path เธ•เนเธเธ—เธฒเธ, path เนเธเธฃเธฐเธเธ, เธงเธฑเธเธ—เธตเนเธเนเธญเธกเธนเธฅเธฅเนเธฒเธชเธธเธ” เนเธฅเธฐเธเธณเธเธงเธเนเธเธฅเนเธ—เธตเนเธขเธฑเธเธฃเธญ process เน€เธเธทเนเธญเธเนเธงเธขเน€เธเนเธเธ•เธญเธเน€เธเนเธฒเธซเธฅเธฑเธเธฃเธญเธ NAS Auto Import</p>
              </div>
              <button className="primary" onClick={() => loadImports().catch(() => undefined)}>Refresh Import Status <span>โป</span></button>
            </div>
            <SourceStatusBoard
              detailed
              imports={imports}
              money={money}
              rows={dashboard?.source_sales ?? []}
            />
          </section>
        )}

        {active === "audit" && auth?.role !== "USER" && (
          <section className="page">
            <div className="section-title"><div><p className="eyebrow teal">GOVERNED HISTORY</p><h2>Approval Audit Log</h2></div></div>
            <div className="audit-list">
              {audit.length === 0 && <div className="empty">เธขเธฑเธเนเธกเนเธกเธตเธเธฒเธฃ Confirm</div>}
              {audit.map((event) => <article key={event.id}><span className={event.action === "APPROVED" ? "audit-icon approved" : "audit-icon rejected"} /><div><strong>{event.action}</strong><p>{event.detail}</p><small>{event.actor_email} ยท {event.created_at}</small></div></article>)}
            </div>
          </section>
        )}

        {active === "authorize" && auth?.role === "ADMINISTRATOR" && (
          <section className="page">
            <div className="section-title"><div><p className="eyebrow teal">ADMINISTRATOR ONLY</p><h2>Authorize Matrix</h2><p className="subtext">เนเธเน role เธเธฃเธดเธเธ—เธตเน backend เธ•เธฃเธงเธเธญเธขเธนเนเนเธฅเนเธง: Administrator, Sale Admin เนเธฅเธฐ User เธเธนเนเธ”เธนเนเธฅเธชเธฒเธกเธฒเธฃเธ–เธเธณเธซเธเธ” user group เธ”เนเธงเธขเธญเธตเน€เธกเธฅ เนเธฅเนเธงเธ•เธฃเธงเธ matrix เธชเธดเธ—เธเธดเนเธฃเธฒเธข module เนเธ”เนเนเธเธซเธเนเธฒเน€เธ”เธตเธขเธง</p></div></div>
            <div className="role-grid">
              <article className="panel role-card"><span>01</span><h3>Administrator</h3><p>เธเธฃเธดเธซเธฒเธฃเธเธนเนเนเธเน, role, import, confirm/apply, audit เนเธฅเธฐ system settings</p></article>
              <article className="panel role-card"><span>02</span><h3>Sale Admin</h3><p>เธ”เธนเธเนเธญเธกเธนเธฅเธเธฒเธข, upload/process RAW, confirm mapping เนเธฅเธฐเธ”เธน audit เธเธฒเธเธเธฒเธข</p></article>
              <article className="panel role-card"><span>03</span><h3>User</h3><p>เธ”เธน dashboard เนเธฅเธฐเธฃเธฒเธขเธเธฒเธเนเธเธเธญเนเธฒเธเธญเธขเนเธฒเธเน€เธ”เธตเธขเธง เนเธกเนเธกเธตเธชเธดเธ—เธเธดเน action เธซเธฅเธฑเธเธเนเธฒเธ</p></article>
            </div>
            <AuthorizationMatrix
              onChange={savePermission}
              permissions={permissions}
            />
            <article className="panel user-management">
              <div className="panel-head"><div><p className="eyebrow">USER MANAGEMENT</p><h3>เธเธณเธซเธเธ” Role เธ”เนเธงเธขเธญเธตเน€เธกเธฅ</h3></div></div>
              <div className="user-form">
                <input type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="name@company.com" />
                <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as Role)}><option value="ADMINISTRATOR">Administrator</option><option value="SALE_ADMIN">Sale Admin</option><option value="USER">User</option></select>
                <button className="approve" onClick={saveUser}>เธเธฑเธเธ—เธถเธ Role</button>
              </div>
              <div className="user-list">{users.map((user) => <div key={user.email}><span><strong>{user.email}</strong><small>{user.created_at}</small></span><b>{roleLabels[user.role]}</b></div>)}</div>
            </article>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="เน€เธกเธเธนเธกเธทเธญเธ–เธทเธญ">
        {visibleNav.slice(0, 3).map(([id, label]) => <button key={id} onClick={() => setActive(id)} className={active === id ? "active" : ""}><span>{id === "dashboard" ? "โ" : id === "reports" ? "โ–ฅ" : "โ“"}</span>{label}</button>)}
      </nav>
    </div>
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
          <h3>เธ—เธ”เธฅเธญเธเธเธฅเธเธฃเธฐเธ—เธเธเนเธญเธเธ•เธฑเธ”เธชเธดเธเนเธ</h3>
        </div>
        <span className="status-pill">เนเธกเนเน€เธเธตเธขเธเธเธฅเธฑเธเธเธฒเธเธเนเธญเธกเธนเธฅ</span>
      </div>
      <div className="simulation-body">
        <div className="scenario-controls">
          <SliderControl label="เธฃเธฒเธเธฒเธเธฒเธข" value={priceLift} min={-5} max={10} step={0.1} suffix="%" onChange={setPriceLift} />
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
          <div><span>เธขเธญเธ”เธเธฒเธขเธเธฒเธ</span><strong>{money(simulation.revenue)}</strong><small>{money(simulation.quantity)} เธเธดเนเธ</small></div>
          <div><span>เธขเธญเธ”เธเธฒเธขเธเธณเธฅเธญเธ</span><strong>{money(simulation.simulatedRevenue)}</strong><small className={simulation.revenueDelta >= 0 ? "positive" : "negative"}>{simulation.revenueDelta >= 0 ? "+" : ""}{money(simulation.revenueDelta)}</small></div>
          <div><span>GP เธเธณเธฅเธญเธ</span><strong>{money(simulation.simulatedGp)}</strong><small className={simulation.gpDelta >= 0 ? "positive" : "negative"}>{simulation.gpDelta >= 0 ? "+" : ""}{money(simulation.gpDelta)}</small></div>
          <div><span>Margin เธเธณเธฅเธญเธ</span><strong>{simulation.margin.toFixed(1)}%</strong><small>เนเธเน COGS baseline 72% เธเธเธเธงเนเธฒเธเธฐเธกเธต Cost เธเธฃเธดเธ</small></div>
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
  detail,
  number,
  status,
  sub,
  title,
  value,
  values,
}: {
  detail: string;
  number: string;
  status: string;
  sub: string;
  title: string;
  value: string;
  values: number[];
}) {
  const max = Math.max(...values.map((item) => Math.abs(Number(item) || 0)), 1);
  const mode = status === "LIVE" ? "live" : "model";
  return (
    <article className={`module-card ${mode}`}>
      <span>{number}</span><b>{status}</b>
      <h4>{title}</h4>
      <div className="module-spark" aria-hidden="true">
        {values.slice(-12).map((item, index) => (
          <i
            key={`${number}-${index}`}
            style={{ height: `${Math.max((Math.abs(item) / max) * 100, 6)}%` }}
          />
        ))}
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
      <p>{detail}</p>
    </article>
  );
}

function SourceStatusBoard({
  detailed = false,
  imports,
  money,
  rows,
}: {
  detailed?: boolean;
  imports: ImportCenterData | null;
  money: (value: number) => string;
  rows: DashboardData["source_sales"];
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
        <div><p className="eyebrow">RAW DATA STATUS</p><h3>เธเนเธญเธกเธนเธฅเน€เธเนเธฒเธฃเธฐเธเธเธ–เธถเธเธงเธฑเธเธ—เธตเนเน€เธ—เนเธฒเนเธฃ</h3></div>
        <span className="status-pill">{imports?.scheduler.enabled ? `AUTO ${imports.scheduler.time}` : "MANUAL"}</span>
      </div>
      <div className="raw-status-table">
        <div className="raw-status-head">
          <span>MT</span><span>เธงเธฑเธเธ—เธตเนเธฅเนเธฒเธชเธธเธ”</span><span>Lag</span><span>เธงเธฑเธเนเธเธฃเธฐเธเธ</span><span>Pending</span>{detailed && <><span>Local path</span><span>NAS path</span></>}
        </div>
        {rawSourcePaths.map((source) => {
          const row = rows.find((item) => item.source_code === source.code);
          const latest = row?.last_date ?? null;
          const lagDays = latest ? Math.max(0, Math.round((today.getTime() - new Date(`${latest}T00:00:00`).getTime()) / 86400000)) : null;
          const status = !latest ? "waiting" : lagDays !== null && lagDays <= 2 ? "ready" : "lagging";
          return (
            <div className={`raw-status-row ${status}`} key={source.code}>
              <span><b className="source-logo mini">{source.code}</b><strong>{source.name}</strong></span>
              <span>{latest ?? "เธฃเธญเธเนเธญเธกเธนเธฅ"}</span>
              <span className={`source-status ${status}`}>{lagDays === null ? "WAITING" : `${lagDays} DAYS`}</span>
              <span>{row ? `${row.available_days} เธงเธฑเธ` : "0 เธงเธฑเธ"}</span>
              <span>{money(pendingBySource.get(source.code) ?? 0)} เนเธเธฅเน</span>
              {detailed && <><code>{source.local}</code><code>{source.nas}</code></>}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function AuthorizationMatrix({
  onChange,
  permissions,
}: {
  onChange: (role: Role, menuId: PageId, canView: boolean) => void;
  permissions: PermissionMatrix;
}) {
  return (
    <article className="panel authorization-matrix">
      <div className="panel-head"><div><p className="eyebrow">ACCESS BY USER GROUP</p><h3>เธชเธดเธ—เธเธดเนเธเธฒเธฃเน€เธซเนเธเน€เธกเธเธนเธฃเธฒเธข Role</h3></div><span className="status-pill">ADMIN EDITABLE</span></div>
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
