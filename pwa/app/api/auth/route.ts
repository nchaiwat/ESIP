import { env } from "cloudflare:workers";
import {
  authenticateUser,
  changeOwnCredentials,
  needsInitialSetup,
  revokeSession,
  setUserCredentials,
} from "../../../db/auth-store";
import { ensureConfirmationStore, listUsers, recordUserAdminEvent } from "../../../db/confirmation-store";
import { isLocalRequest } from "../request-auth";

const COOKIE_NAME = "esip_session";
const COOKIE_MAX_AGE = 8 * 60 * 60;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = env as unknown as Record<string, string | undefined>;
  return Response.json({
    setupRequired: isLocalRequest(request) && await needsInitialSetup(),
    adConfigured: Boolean(config.ESIP_AD_GATEWAY_URL),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: "LOGIN" | "SETUP" | "CHANGE_CREDENTIALS";
    identifier?: string;
    secret?: string;
    method?: "LOCAL" | "PIN" | "ACTIVE_DIRECTORY";
    email?: string;
    password?: string;
    pin?: string;
    currentSecret?: string;
    currentMethod?: "LOCAL" | "PIN";
  };

  if (body.action === "CHANGE_CREDENTIALS") {
    try {
      const email = await changeOwnCredentials({
        token: readCookie(request, COOKIE_NAME),
        currentSecret: body.currentSecret ?? "",
        currentMethod: body.currentMethod === "PIN" ? "PIN" : "LOCAL",
        newPassword: body.password,
        newPin: body.pin,
      });
      await recordUserAdminEvent(email, "OWN_CREDENTIALS_CHANGED", email, "User changed own Password or PIN");
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "เปลี่ยนข้อมูลความปลอดภัยไม่สำเร็จ" },
        { status: 422 },
      );
    }
  }

  if (body.action === "SETUP") {
    if (!isLocalRequest(request) || !(await needsInitialSetup())) {
      return Response.json({ error: "Initial setup is not available" }, { status: 403 });
    }
    await ensureConfirmationStore();
    const email = body.email?.trim().toLowerCase() ?? "";
    const users = await listUsers();
    const admin = users.find((user) => user.email === email && user.role === "ADMINISTRATOR");
    if (!admin) return Response.json({ error: "กรุณาเลือกอีเมล Administrator ที่มีอยู่ในระบบ" }, { status: 400 });
    try {
      await setUserCredentials(email, { password: body.password, pin: body.pin });
      await recordUserAdminEvent(email, "USER_INITIAL_SETUP", email, "Created local password and PIN hashes");
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Setup failed" }, { status: 422 });
    }
  }

  const identifier = body.identifier?.trim() ?? "";
  const secret = body.secret ?? "";
  const method = body.method ?? "LOCAL";
  if (!identifier || !secret) {
    return Response.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 400 });
  }
  const result = await authenticateUser({
    identifier,
    secret,
    method,
    ipAddress: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local",
    userAgent: request.headers.get("user-agent") ?? "unknown",
  });
  if (!result.ok) {
    if (result.rateLimited) {
      return Response.json(
        { error: "มีการลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่", retryAfter: result.retryAfter },
        { status: 429, headers: { "retry-after": String(result.retryAfter) } },
      );
    }
    return Response.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  return Response.json(
    { ok: true, user: result.user, expiresAt: result.expiresAt },
    { headers: { "set-cookie": sessionCookie(result.token, request) } },
  );
}

export async function DELETE(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  await revokeSession(token);
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` } },
  );
}

function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

function readCookie(request: Request, name: string) {
  const value = request.headers.get("cookie") ?? "";
  const item = value.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
}
