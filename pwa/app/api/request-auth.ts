import { getChatGPTUser } from "../chatgpt-auth";
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
