import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const adminUsers = sqliteTable("admin_users", {
  email: text("email").primaryKey(),
  role: text("role").notNull().default("ADMINISTRATOR"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const confirmations = sqliteTable("confirmations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  sourceCode: text("source_code").notNull(),
  subject: text("subject").notNull(),
  candidate: text("candidate").notNull(),
  evidence: text("evidence").notNull(),
  priority: text("priority").notNull(),
  affectedRows: integer("affected_rows").notNull().default(0),
  status: text("status").notNull().default("PENDING"),
  approvalReference: text("approval_reference"),
  decidedBy: text("decided_by"),
  decidedAt: text("decided_at"),
  applyStatus: text("apply_status").notNull().default("NOT_APPLIED"),
  applyMessage: text("apply_message"),
  appliedAt: text("applied_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  confirmationId: integer("confirmation_id"),
  action: text("action").notNull(),
  actorEmail: text("actor_email").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const roleMenuPermissions = sqliteTable("role_menu_permissions", {
  role: text("role").notNull(),
  menuId: text("menu_id").notNull(),
  canView: integer("can_view").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
