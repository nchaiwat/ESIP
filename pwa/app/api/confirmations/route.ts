import {
  canConfirm,
  decideConfirmation,
  ensureConfirmationStore,
  getConfirmation,
  listAuditEvents,
  listConfirmations,
} from "../../../db/confirmation-store";
import { isLocalRequest, resolveRequestActor } from "../request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureConfirmationStore();
    const actor = await resolveRequestActor(request);
    if (!actor.user) {
      return Response.json({
        confirmations: [],
        audit: [],
        user: null,
        role: "USER",
        canConfirm: false,
        mode: actor.mode,
      });
    }
    return Response.json({
      confirmations: await listConfirmations(),
      audit: await listAuditEvents(),
      user: actor.user,
      role: actor.role,
      canConfirm: canConfirm(actor.role),
      mode: actor.mode,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureConfirmationStore();
    const actor = await resolveRequestActor(request);
    if (!actor.user) {
      return Response.json({ error: "Sign in is required" }, { status: 401 });
    }
    if (!canConfirm(actor.role)) {
      return Response.json({ error: "Administrator or Sale Admin permission is required" }, { status: 403 });
    }

    const body = (await request.json()) as {
      id?: number;
      decision?: string;
      reference?: string;
      applyCompleted?: boolean;
      applyMessage?: string;
    };
    const id = Number(body.id);
    const decision = body.decision;
    const reference = body.reference?.trim() ?? "";
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Valid item id is required" }, { status: 400 });
    }
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return Response.json({ error: "Valid decision is required" }, { status: 400 });
    }
    if (reference.length < 3) {
      return Response.json(
        { error: "Approval reference is required" },
        { status: 400 },
      );
    }

    let applyResult = { status: "NOT_REQUIRED", message: "Rejected; no apply required" };
    if (decision === "APPROVED") {
      const item = await getConfirmation(id);
      if (!item) {
        return Response.json({ error: "Confirmation item not found" }, { status: 404 });
      }
      if (!isLocalRequest(request)) {
        return Response.json(
          { error: "Immediate apply is available through ESIP Local only" },
          { status: 503 },
        );
      }
      if (!body.applyCompleted) {
        return Response.json(
          { error: "Immediate apply must complete before confirmation is recorded" },
          { status: 422 },
        );
      }
      applyResult = {
        status: "APPLIED",
        message: body.applyMessage?.trim() || "Applied by ESIP Apply Bridge",
      };
    }

    await decideConfirmation(id, decision, reference, actor.user.email, applyResult);
    return Response.json({
      confirmations: await listConfirmations(),
      audit: await listAuditEvents(),
      role: actor.role,
      canConfirm: canConfirm(actor.role),
      user: actor.user,
      mode: actor.mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("already been decided") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
