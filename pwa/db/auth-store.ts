import { env } from "cloudflare:workers";
import { ensureConfirmationStore, type UserRole } from "./confirmation-store";

const ITERATIONS = 210_000;
const SESSION_SECONDS = 8 * 60 * 60;

type LoginMethod = "LOCAL" | "PIN" | "ACTIVE_DIRECTORY";

function db(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureAuthStore() {
  await ensureConfirmationStore();
  const d1 = db();
  const columns = await d1.prepare("PRAGMA table_info(admin_users)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("credential_hash")) {
    await d1.prepare("ALTER TABLE admin_users ADD COLUMN credential_hash TEXT").run();
  }
  if (!names.has("pin_hash")) {
    await d1.prepare("ALTER TABLE admin_users ADD COLUMN pin_hash TEXT").run();
  }
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS auth_login_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      result TEXT NOT NULL,
      login_method TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);
}

export async function needsInitialSetup() {
  await ensureAuthStore();
  const row = await db()
    .prepare(`SELECT COUNT(*) AS count FROM admin_users
      WHERE role = 'ADMINISTRATOR'
      AND (credential_hash IS NOT NULL OR pin_hash IS NOT NULL)`)
    .first<{ count: number }>();
  return (row?.count ?? 0) === 0;
}

export async function setUserCredentials(
  email: string,
  values: { password?: string; pin?: string },
) {
  await ensureAuthStore();
  const normalized = email.trim().toLowerCase();
  const updates: string[] = [];
  const bindings: string[] = [];
  if (values.password) {
    if (values.password.length < 10) throw new Error("Password ต้องมีอย่างน้อย 10 ตัวอักษร");
    updates.push("credential_hash = ?");
    bindings.push(await hashSecret(values.password));
  }
  if (values.pin) {
    if (!/^\d{6}$/.test(values.pin)) throw new Error("PIN ต้องเป็นตัวเลข 6 หลัก");
    updates.push("pin_hash = ?");
    bindings.push(await hashSecret(values.pin));
  }
  if (updates.length === 0) return;
  await db()
    .prepare(`UPDATE admin_users SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE email = ?`)
    .bind(...bindings, normalized)
    .run();
}

export async function authenticateUser(input: {
  identifier: string;
  secret: string;
  method: LoginMethod;
  ipAddress: string;
  userAgent: string;
}) {
  await ensureAuthStore();
  const identifier = input.identifier.trim().toLowerCase();
  const user = await db()
    .prepare(`SELECT email, username, display_name, role, status, auth_source,
      failed_attempts, locked_until, credential_hash, pin_hash
      FROM admin_users WHERE lower(email) = ? OR lower(username) = ?`)
    .bind(identifier, identifier)
    .first<{
      email: string;
      username: string;
      display_name: string;
      role: UserRole;
      status: string;
      auth_source: string;
      failed_attempts: number;
      locked_until: string | null;
      credential_hash: string | null;
      pin_hash: string | null;
    }>();

  if (!user) return loginFailure(identifier, input, "USER_NOT_FOUND");
  if (user.status !== "ACTIVE") return loginFailure(identifier, input, "ACCOUNT_SUSPENDED", false);
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return loginFailure(identifier, input, "ACCOUNT_TEMPORARILY_LOCKED", false);
  }

  let valid = false;
  if (input.method === "PIN") {
    valid = Boolean(user.pin_hash && await verifySecret(input.secret, user.pin_hash));
  } else if (input.method === "LOCAL") {
    valid = Boolean(user.credential_hash && await verifySecret(input.secret, user.credential_hash));
  } else {
    valid = await verifyActiveDirectory(user.username, input.secret);
  }
  if (!valid) return loginFailure(identifier, input, "INVALID_CREDENTIALS", true, user.email, user.failed_attempts);

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db().batch([
    db().prepare(`UPDATE admin_users SET failed_attempts = 0, locked_until = NULL,
      last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = ?`).bind(user.email),
    db().prepare("INSERT INTO auth_sessions (token_hash, email, expires_at) VALUES (?, ?, ?)")
      .bind(tokenHash, user.email, expiresAt),
    loginEvent(identifier, "LOGIN_SUCCESS", input.method, input.ipAddress, input.userAgent, "SUCCESS"),
  ]);
  return {
    ok: true as const,
    token,
    expiresAt,
    user: { email: user.email, displayName: user.display_name || user.username, role: user.role },
  };
}

async function loginFailure(
  identifier: string,
  input: { method: LoginMethod; ipAddress: string; userAgent: string },
  reason: string,
  increment = false,
  email?: string,
  previousAttempts = 0,
) {
  const statements = [loginEvent(identifier, "LOGIN_FAILED", input.method, input.ipAddress, input.userAgent, reason)];
  if (increment && email) {
    const attempts = previousAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    statements.push(
      db().prepare(`UPDATE admin_users SET failed_attempts = ?,
        locked_until = ?, status = CASE WHEN ? >= 10 THEN 'SUSPENDED' ELSE status END,
        updated_at = CURRENT_TIMESTAMP WHERE email = ?`)
        .bind(attempts, lockedUntil, attempts, email),
    );
  }
  await db().batch(statements);
  return { ok: false as const };
}

export async function getSessionUser(token: string) {
  if (!token) return null;
  await ensureAuthStore();
  return db()
    .prepare(`SELECT u.email, u.username, u.display_name, u.role, u.status
      FROM auth_sessions s JOIN admin_users u ON u.email = s.email
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'ACTIVE'`)
    .bind(await sha256(token), new Date().toISOString())
    .first<{ email: string; username: string; display_name: string; role: UserRole; status: string }>();
}

export async function revokeSession(token: string) {
  if (!token) return;
  await ensureAuthStore();
  await db().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function changeOwnCredentials(input: {
  token: string;
  currentSecret: string;
  currentMethod: "LOCAL" | "PIN";
  newPassword?: string;
  newPin?: string;
}) {
  if (!input.newPassword && !input.newPin) throw new Error("กรุณาระบุ Password หรือ PIN ใหม่");
  await ensureAuthStore();
  const tokenHash = await sha256(input.token);
  const user = await db()
    .prepare(`SELECT u.email, u.credential_hash, u.pin_hash
      FROM auth_sessions s JOIN admin_users u ON u.email = s.email
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'ACTIVE'`)
    .bind(tokenHash, new Date().toISOString())
    .first<{ email: string; credential_hash: string | null; pin_hash: string | null }>();
  if (!user) throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  const currentHash = input.currentMethod === "PIN" ? user.pin_hash : user.credential_hash;
  if (!currentHash || !(await verifySecret(input.currentSecret, currentHash))) {
    throw new Error("Password หรือ PIN ปัจจุบันไม่ถูกต้อง");
  }
  await setUserCredentials(user.email, { password: input.newPassword, pin: input.newPin });
  await db()
    .prepare("DELETE FROM auth_sessions WHERE email = ? AND token_hash <> ?")
    .bind(user.email, tokenHash)
    .run();
  return user.email;
}

function loginEvent(username: string, result: string, method: string, ip: string, agent: string, reason: string) {
  return db()
    .prepare(`INSERT INTO auth_login_events
      (username, result, login_method, ip_address, user_agent, reason)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(username, result, method, ip.slice(0, 120), agent.slice(0, 500), reason);
}

async function verifyActiveDirectory(username: string, password: string) {
  const config = env as unknown as Record<string, string | undefined>;
  const gatewayUrl = config.ESIP_AD_GATEWAY_URL?.trim();
  const gatewayKey = config.ESIP_AD_GATEWAY_KEY?.trim();
  if (!gatewayUrl || !gatewayKey) return false;
  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-esip-gateway-key": gatewayKey },
    body: JSON.stringify({ username, password }),
  });
  return response.ok;
}

async function hashSecret(secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

async function verifySecret(secret: string, stored: string) {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !expected) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations: Number(iterations) },
    key,
    256,
  );
  return constantTimeEqual(new Uint8Array(bits), fromBase64(expected));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64(new Uint8Array(digest));
}

function randomToken(bytes: number) {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)));
}

function toBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
