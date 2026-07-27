import {
  ensureConfirmationStore,
  listRoleMenuPermissions,
  MENU_IDS,
  ROLES,
  updateRoleMenuPermission,
  type MenuId,
  type UserRole,
} from "../../../db/confirmation-store";
import { resolveRequestActor } from "../request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  return Response.json({
    permissions: await listRoleMenuPermissions(),
    role: actor.role,
    canManage: actor.role === "ADMINISTRATOR",
  });
}

export async function POST(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  const body = (await request.json()) as {
    role?: UserRole;
    menuId?: MenuId;
    canView?: boolean;
  };
  if (!body.role || !ROLES.includes(body.role) || !body.menuId || !MENU_IDS.includes(body.menuId)) {
    return Response.json({ error: "Valid role and menu are required" }, { status: 400 });
  }
  try {
    await updateRoleMenuPermission(body.role, body.menuId, Boolean(body.canView));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Permission update failed" },
      { status: 422 },
    );
  }
  return Response.json({ permissions: await listRoleMenuPermissions() });
}
