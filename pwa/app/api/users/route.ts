import {
  deleteUser,
  ensureConfirmationStore,
  listUsers,
  ROLES,
  upsertUser,
  type UserRole,
  type ManagedUser,
} from "../../../db/confirmation-store";
import { resolveRequestActor } from "../request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  return Response.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  await ensureConfirmationStore();
  const actor = await resolveRequestActor(request);
  if (actor.role !== "ADMINISTRATOR") {
    return Response.json({ error: "Administrator permission is required" }, { status: 403 });
  }
  const body = (await request.json()) as {
    email?: string;
    role?: UserRole;
    display_name?: string;
    department?: string;
    job_title?: string;
    auth_source?: ManagedUser["auth_source"];
    status?: ManagedUser["status"];
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@") || !body.role || !ROLES.includes(body.role)) {
    return Response.json({ error: "Valid email and role are required" }, { status: 400 });
  }
  await upsertUser(email, body.role, {
    display_name: body.display_name,
    department: body.department,
    job_title: body.job_title,
    auth_source: body.auth_source,
    status: body.status,
  });
  return Response.json({ users: await listUsers() });
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
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Delete user failed" },
      { status: 422 },
    );
  }
  return Response.json({ users: await listUsers() });
}
