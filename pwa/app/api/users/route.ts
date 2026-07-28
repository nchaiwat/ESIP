import {
  deleteUser,
  ensureConfirmationStore,
  listUserAdminEvents,
  listUsers,
  recordUserAdminEvent,
  ROLES,
  setUserStatus,
  unlockUser,
  upsertUser,
  type UserRole,
  type ManagedUser,
} from "../../../db/confirmation-store";
import { setUserCredentials } from "../../../db/auth-store";
import { resolveRequestActor } from "../request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  return Response.json({
    users: await listUsers(),
    events: await listUserAdminEvents(),
  });
}

export async function POST(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  const body = (await request.json()) as {
    email?: string;
    username?: string;
    role?: UserRole;
    display_name?: string;
    department?: string;
    job_title?: string;
    auth_source?: ManagedUser["auth_source"];
    status?: ManagedUser["status"];
    password?: string;
    pin?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@") || !body.role || !ROLES.includes(body.role)) {
    return Response.json({ error: "Valid email and role are required" }, { status: 400 });
  }
  try {
    await upsertUser(email, body.role, {
      username: body.username,
      display_name: body.display_name,
      department: body.department,
      job_title: body.job_title,
      auth_source: body.auth_source,
      status: body.status,
    });
    await setUserCredentials(email, { password: body.password, pin: body.pin });
    await recordUserAdminEvent(
      actor.user?.email ?? "local-administrator@esip.local",
      "USER_SAVED",
      email,
      `role=${body.role}; auth=${body.auth_source ?? "ACTIVE_DIRECTORY"}; status=${body.status ?? "ACTIVE"}`,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Save user failed" },
      { status: 422 },
    );
  }
  return Response.json({
    users: await listUsers(),
    events: await listUserAdminEvents(),
  });
}

export async function PATCH(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  const body = (await request.json()) as {
    email?: string;
    action?: "ACTIVATE" | "SUSPEND" | "UNLOCK";
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@") || !body.action) {
    return Response.json({ error: "Valid email and action are required" }, { status: 400 });
  }
  try {
    if (body.action === "UNLOCK") {
      await unlockUser(email);
    } else {
      await setUserStatus(email, body.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE");
    }
    await recordUserAdminEvent(
      actor.user?.email ?? "local-administrator@esip.local",
      `USER_${body.action}`,
      email,
      body.action === "UNLOCK" ? "Reset failed attempts and account lock" : `status=${body.action}`,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "User action failed" },
      { status: 422 },
    );
  }
  return Response.json({
    users: await listUsers(),
    events: await listUserAdminEvents(),
  });
}

export async function DELETE(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return Response.json({ error: "Valid email is required" }, { status: 400 });
  }
  try {
    await deleteUser(email);
    await recordUserAdminEvent(
      actor.user?.email ?? "local-administrator@esip.local",
      "USER_DELETED",
      email,
      "User record deleted",
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Delete user failed" },
      { status: 422 },
    );
  }
  return Response.json({
    users: await listUsers(),
    events: await listUserAdminEvents(),
  });
}
