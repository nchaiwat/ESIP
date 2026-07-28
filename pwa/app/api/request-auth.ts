import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { getSessionUser } from "../../db/auth-store";
import {
  ensureBootstrapAdmin,
  getUserRole,
  ROLES,
  type UserRole,
} from "../../db/confirmation-store";

export function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export async function resolveRequestActor(request: Request) {
  const session = await getSessionUser(readCookie(request, "esip_session"));
  if (session) {
    return {
      user: {
        displayName: session.display_name || session.username,
        email: session.email,
        fullName: session.display_name || null,
        username: session.username,
      },
      role: session.role,
      mode: "PRIVATE_SITE" as const,
    };
  }

  const signedInUser = await getChatGPTUser();
  if (signedInUser) {
    await ensureBootstrapAdmin(signedInUser.email);
    return {
      user: signedInUser,
      role: await getUserRole(signedInUser.email),
      mode: "PRIVATE_SITE" as const,
    };
  }

  if (!isLocalRequest(request)) {
    return { user: null, role: "USER" as UserRole, mode: "ANONYMOUS" as const };
  }

  const config = env as unknown as Record<string, string | undefined>;
  if (config.ESIP_LOCAL_TRIAL?.toLowerCase() !== "true") {
    return { user: null, role: "USER" as UserRole, mode: "ANONYMOUS" as const };
  }

  const requestedRole = request.headers.get("x-esip-local-role") as UserRole | null;
  const role = requestedRole && ROLES.includes(requestedRole)
    ? requestedRole
    : "ADMINISTRATOR";
  return {
    user: {
      displayName:
        role === "ADMINISTRATOR"
          ? "Local Administrator"
          : role === "SALE_ADMIN"
            ? "Local Sale Admin"
            : "Local User",
      email: `${role.toLowerCase().replace("_", "-")}@esip.local`,
      fullName: null,
    },
    role,
    mode: "LOCAL_TRIAL" as const,
  };
}

function readCookie(request: Request, name: string) {
  const value = request.headers.get("cookie") ?? "";
  const item = value.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
}
