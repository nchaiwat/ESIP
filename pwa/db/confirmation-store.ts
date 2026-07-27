import { env } from "cloudflare:workers";

export const ROLES = ["ADMINISTRATOR", "SALE_ADMIN", "USER"] as const;
export type UserRole = (typeof ROLES)[number];
export const MENU_IDS = [
  "dashboard",
  "reports",
  "simulations",
  "imports",
  "confirm",
  "sources",
  "audit",
  "authorize",
] as const;
export type MenuId = (typeof MENU_IDS)[number];

const DEFAULT_MENU_PERMISSIONS: Record<UserRole, Record<MenuId, boolean>> = {
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

export type ConfirmationRow = {
  id: number;
  category: string;
  source_code: string;
  subject: string;
  candidate: string;
  evidence: string;
  priority: string;
  affected_rows: number;
  status: string;
  approval_reference: string | null;
  decided_by: string | null;
  decided_at: string | null;
  apply_status: string;
  apply_message: string | null;
  applied_at: string | null;
  created_at: string;
};

export type AuditRow = {
  id: number;
  confirmation_id: number | null;
  action: string;
  actor_email: string;
  detail: string;
  created_at: string;
};

function db(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureConfirmationStore() {
  const d1 = db();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
      email TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      source_code TEXT NOT NULL,
      subject TEXT NOT NULL,
      candidate TEXT NOT NULL,
      evidence TEXT NOT NULL,
      priority TEXT NOT NULL,
      affected_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approval_reference TEXT,
      decided_by TEXT,
      decided_at TEXT,
      apply_status TEXT NOT NULL DEFAULT 'NOT_APPLIED',
      apply_message TEXT,
      applied_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      confirmation_id INTEGER,
      action TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS role_menu_permissions (
      role TEXT NOT NULL,
      menu_id TEXT NOT NULL,
      can_view INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (role, menu_id)
    )`),
  ]);

  await migrateLegacyRolesAndColumns(d1);
  await seedDefaultMenuPermissions(d1);

  const count = await d1
    .prepare("SELECT COUNT(*) AS count FROM confirmations")
    .first<{ count: number }>();
  if ((count?.count ?? 0) === 0) {
    await d1.batch([
      d1.prepare(`INSERT INTO confirmations
        (category, source_code, subject, candidate, evidence, priority, affected_rows)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          "PRODUCT_MAPPING",
          "GBH",
          "8859283002230",
          "FUS22-F1022-240040",
          "Exact Item Master barcode",
          "P1",
          1456,
        ),
      d1.prepare(`INSERT INTO confirmations
        (category, source_code, subject, candidate, evidence, priority, affected_rows)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          "PRODUCT_MAPPING",
          "HH",
          "900340280",
          "FA07-W0422-080050",
          "Exact Item Master barcode",
          "P4",
          100,
        ),
      d1.prepare(`INSERT INTO confirmations
        (category, source_code, subject, candidate, evidence, priority, affected_rows)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          "PRODUCT_REVIEW",
          "MH",
          "31 cross-source OSCN candidates",
          "Review individually before SAP request",
          "Unique OSCN evidence from HP/CHP",
          "P2",
          2864,
        ),
      d1.prepare(`INSERT INTO confirmations
        (category, source_code, subject, candidate, evidence, priority, affected_rows)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          "BRANCH_REVIEW",
          "ALL",
          "195 high-confidence branch identities",
          "Review governed crosswalk candidates",
          "142 name matches + 53 same-code enrichment",
          "P1",
          777938,
        ),
    ]);
  }
}

async function seedDefaultMenuPermissions(d1: D1Database) {
  const statements = [];
  for (const role of ROLES) {
    for (const menuId of MENU_IDS) {
      statements.push(
        d1.prepare(`INSERT OR IGNORE INTO role_menu_permissions
          (role, menu_id, can_view)
          VALUES (?, ?, ?)`)
          .bind(role, menuId, DEFAULT_MENU_PERMISSIONS[role][menuId] ? 1 : 0),
      );
    }
  }
  await d1.batch(statements);
}

export async function ensureBootstrapAdmin(email: string) {
  const d1 = db();
  const count = await d1
    .prepare("SELECT COUNT(*) AS count FROM admin_users")
    .first<{ count: number }>();
  if ((count?.count ?? 0) === 0) {
    await d1
      .prepare("INSERT INTO admin_users (email, role) VALUES (?, 'ADMINISTRATOR')")
      .bind(email)
      .run();
  }
}

async function migrateLegacyRolesAndColumns(d1: D1Database) {
  await d1
    .prepare(`UPDATE admin_users SET role = CASE role
      WHEN 'SYSTEM_ADMIN' THEN 'ADMINISTRATOR'
      WHEN 'DATA_STEWARD' THEN 'SALE_ADMIN'
      ELSE role END
      WHERE role IN ('SYSTEM_ADMIN', 'DATA_STEWARD')`)
    .run();

  const columns = await d1
    .prepare("PRAGMA table_info(confirmations)")
    .all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("apply_status")) {
    await d1
      .prepare(
        "ALTER TABLE confirmations ADD COLUMN apply_status TEXT NOT NULL DEFAULT 'NOT_APPLIED'",
      )
      .run();
  }
  if (!names.has("apply_message")) {
    await d1
      .prepare("ALTER TABLE confirmations ADD COLUMN apply_message TEXT")
      .run();
  }
  if (!names.has("applied_at")) {
    await d1.prepare("ALTER TABLE confirmations ADD COLUMN applied_at TEXT").run();
  }
}

export async function getUserRole(email: string): Promise<UserRole> {
  const row = await db()
    .prepare("SELECT role FROM admin_users WHERE email = ?")
    .bind(email)
    .first<{ role: string }>();
  return ROLES.includes(row?.role as UserRole) ? (row?.role as UserRole) : "USER";
}

export function canConfirm(role: UserRole) {
  return role === "ADMINISTRATOR" || role === "SALE_ADMIN";
}

export async function listRoleMenuPermissions() {
  const result = await db()
    .prepare(`SELECT role, menu_id, can_view
      FROM role_menu_permissions
      ORDER BY role, menu_id`)
    .all<{ role: UserRole; menu_id: MenuId; can_view: number }>();
  const matrix: Record<UserRole, Record<MenuId, boolean>> = structuredClone(DEFAULT_MENU_PERMISSIONS);
  for (const row of result.results) {
    if (ROLES.includes(row.role) && MENU_IDS.includes(row.menu_id)) {
      matrix[row.role][row.menu_id] = Boolean(row.can_view);
    }
  }
  return matrix;
}

export async function updateRoleMenuPermission(role: UserRole, menuId: MenuId, canView: boolean) {
  if (!ROLES.includes(role) || !MENU_IDS.includes(menuId)) throw new Error("Invalid permission");
  if (role === "ADMINISTRATOR" && menuId === "authorize" && !canView) {
    throw new Error("Administrator must keep access to Authorize Matrix");
  }
  await db()
    .prepare(`INSERT INTO role_menu_permissions (role, menu_id, can_view, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role, menu_id) DO UPDATE SET
        can_view = excluded.can_view,
        updated_at = CURRENT_TIMESTAMP`)
    .bind(role, menuId, canView ? 1 : 0)
    .run();
}

export async function listUsers() {
  const result = await db()
    .prepare("SELECT email, role, created_at FROM admin_users ORDER BY email")
    .all<{ email: string; role: UserRole; created_at: string }>();
  return result.results;
}

export async function upsertUser(email: string, role: UserRole) {
  if (!ROLES.includes(role)) throw new Error("Invalid role");
  await db()
    .prepare(`INSERT INTO admin_users (email, role)
      VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role`)
    .bind(email.trim().toLowerCase(), role)
    .run();
}

export async function listConfirmations() {
  const result = await db()
    .prepare(`SELECT * FROM confirmations
      ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,
      CASE priority WHEN 'P1' THEN 0 WHEN 'P2' THEN 1 WHEN 'P3' THEN 2 ELSE 3 END,
      affected_rows DESC, id`)
    .all<ConfirmationRow>();
  return result.results;
}

export async function getConfirmation(id: number) {
  return db()
    .prepare("SELECT * FROM confirmations WHERE id = ?")
    .bind(id)
    .first<ConfirmationRow>();
}

export async function listAuditEvents() {
  const result = await db()
    .prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT 50")
    .all<AuditRow>();
  return result.results;
}

export async function decideConfirmation(
  id: number,
  decision: "APPROVED" | "REJECTED",
  reference: string,
  actor: string,
  applyResult?: { status: string; message: string },
) {
  const d1 = db();
  const current = await d1
    .prepare("SELECT * FROM confirmations WHERE id = ?")
    .bind(id)
    .first<ConfirmationRow>();
  if (!current) throw new Error("Confirmation item not found");
  if (current.status !== "PENDING") {
    throw new Error("This item has already been decided");
  }

  await d1.batch([
    d1.prepare(`UPDATE confirmations
      SET status = ?, approval_reference = ?, decided_by = ?,
          decided_at = CURRENT_TIMESTAMP, apply_status = ?,
          apply_message = ?, applied_at = CASE WHEN ? = 'APPLIED'
            THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ? AND status = 'PENDING'`)
      .bind(
        decision,
        reference,
        actor,
        applyResult?.status ?? "NOT_REQUIRED",
        applyResult?.message ?? null,
        applyResult?.status ?? "NOT_REQUIRED",
        id,
      ),
    d1.prepare(`INSERT INTO audit_events
      (confirmation_id, action, actor_email, detail)
      VALUES (?, ?, ?, ?)`)
      .bind(
        id,
        decision,
        actor,
        `${current.category} ${current.source_code}/${current.subject}; reference=${reference}`,
      ),
  ]);
}
