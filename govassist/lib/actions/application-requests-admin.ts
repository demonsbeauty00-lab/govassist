"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import {
  OFFICIAL_STAGE_LABEL, REQUEST_STATUSES, RETENTION_DAYS, SIGNED_URL_SECONDS, STATUS_LABEL, TERMINAL_STATUSES,
  type RequestStatus,
} from "@/lib/application-requests/constants";
import {
  adminListFilterSchema, adminUpdateSchema, claimSchema, internalNoteSchema, isPastDateIST, linkCycleSchema,
  officialStageSchema,
} from "@/lib/application-requests/schema";
import { canAdvanceOfficialStage, isOfficiallySubmitted } from "@/lib/application-requests/official-stage";
import {
  CONFIRMATION_NOTIFICATION_BODY, FORM_FILLING_NOTIFICATION_BODY, MESSAGE_NOTIFICATION_BODY,
  OFFICIAL_STAGE_NOTIFICATION_BODY, statusNotificationBody,
} from "@/lib/application-requests/notify-text";
import { validateAdminTransition } from "@/lib/application-requests/transitions";
import { interpretConditionalUpdate } from "@/lib/application-requests/workflow";
import { bytesMatchMime, safeFileName, validateUploadMeta } from "@/lib/application-requests/file-validation";

const BUCKET = "documents";

type RequestRow = Database["public"]["Tables"]["application_requests"]["Row"];
type DocumentRow = Database["public"]["Tables"]["application_request_documents"]["Row"];
type EventRow = Database["public"]["Tables"]["application_request_events"]["Row"];

export interface AdminRequestDetail {
  request: RequestRow;
  events: EventRow[];
  documents: DocumentRow[];
  /** null = unassigned. `mine` = assigned to the admin viewing it. */
  assignment: { mine: boolean; assignedAt: string } | null;
}

export interface AdminActionResult {
  error?: string;
  /** The change WAS saved, but something secondary (e.g. the applicant's
   *  notification) failed and the admin should follow up. */
  warning?: string;
}

/** Same boundary as the other admin actions: verified through the caller's
 *  own session against the `admins` table, re-checked in EVERY function
 *  below (never trusted from the UI), because everything afterwards uses
 *  the service-role client which bypasses RLS. */
async function requireAdmin() {
  const result = await requireUser();
  if (!result.ok) return { ok: false as const, error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { data } = await result.supabase.from("admins").select("user_id").eq("user_id", result.user.id).maybeSingle();
  if (!data) return { ok: false as const, error: "You don't have access to this." };
  return { ok: true as const, userId: result.user.id };
}

function revalidateAll(id: string, userId?: string) {
  revalidatePath("/admin/application-requests");
  revalidatePath(`/admin/application-requests/${id}`);
  revalidatePath("/apply-assistant");
  revalidatePath(`/apply-assistant/${id}`);
  if (userId) revalidatePath("/notifications");
}

/** Best-effort, deduplicated per event (see 0013_notification_dedupe).
 *  Returns false when it could not be created so the caller can tell the
 *  admin instead of silently pretending the applicant was informed. */
async function notifyApplicant(
  admin: ReturnType<typeof createAdminClient>,
  request: Pick<RequestRow, "id" | "user_id" | "request_code">,
  eventId: string,
  body: string,
): Promise<boolean> {
  try {
    const { error } = await admin.from("notifications").upsert(
      {
        user_id: request.user_id,
        title: `Update on your request ${request.request_code}`,
        body: body.slice(0, 300),
        type: "system" as const,
        dedupe_key: `apprequest:${request.id}:${eventId}`,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
    if (!error) return true;
    console.error("application_requests: notification failed", error.code);
  } catch {
    console.error("application_requests: notification threw");
  }
  // Internal audit trail of the failure (never shown to the applicant).
  await admin.from("application_request_events").insert({
    request_id: request.id, actor_role: "system", event_type: "notification_failed", visibility: "internal",
    message: "The in-app notification could not be created for the previous change.",
  });
  return false;
}

const NOTIFY_WARNING = "Saved, but the applicant could not be notified. Message them directly (WhatsApp/SMS) or try a follow-up message.";

/** Narrows a database status string to the known union before it is used as a key. */
function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);
}

export async function getRequestCountsAction(): Promise<{ error?: string; counts: Record<RequestStatus, number> }> {
  const empty = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, counts: empty };
  const admin = createAdminClient();
  const { data, error } = await admin.from("application_requests").select("status");
  if (error) return { error: "Couldn't load counts.", counts: empty };
  const rows: { status: unknown }[] = data ?? [];
  for (const row of rows) {
    if (isRequestStatus(row.status)) empty[row.status] += 1;
  }
  return { counts: empty };
}

export async function listAdminRequestsAction(filter: { status?: string; q?: string }): Promise<{ error?: string; requests: RequestRow[] }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, requests: [] };
  const parsed = adminListFilterSchema.safeParse(filter);
  if (!parsed.success) return { error: "Invalid filter.", requests: [] };

  const admin = createAdminClient();
  let query = admin.from("application_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  const { data, error } = await query;
  if (error) return { error: "Couldn't load requests.", requests: [] };

  // Text search runs in code, not inside a PostgREST filter string, so user
  // input can never alter the query structure.
  const q = parsed.data.q?.toLowerCase();
  const rows = q
    ? (data ?? []).filter((r) =>
        [r.request_code, r.applicant_name, r.exam_title].some((v) => v.toLowerCase().includes(q)))
    : (data ?? []);
  return { requests: rows };
}

export async function getAdminRequestAction(requestId: string): Promise<AdminRequestDetail | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;
  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return null;
  const [{ data: events }, { data: documents }, { data: assigned }] = await Promise.all([
    admin.from("application_request_events").select("*").eq("request_id", requestId).order("created_at", { ascending: false }),
    admin.from("application_request_documents").select("*").eq("request_id", requestId).order("created_at", { ascending: true }),
    admin.from("application_request_assignments").select("admin_id, assigned_at").eq("request_id", requestId).maybeSingle(),
  ]);
  return {
    request, events: events ?? [], documents: documents ?? [],
    assignment: assigned ? { mine: assigned.admin_id === gate.userId, assignedAt: assigned.assigned_at } : null,
  };
}

export async function getAdminDocumentUrlAction(documentId: string): Promise<{ url?: string; error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const admin = createAdminClient();
  const { data: doc } = await admin.from("application_request_documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc) return { error: "Document not found." };

  // Audit FIRST (who opened a private document and when — never its
  // contents or URL). If the audit row can't be written, no URL is issued.
  const { error: auditErr } = await admin.from("application_request_events").insert({
    request_id: doc.request_id, actor_id: gate.userId, actor_role: "admin", event_type: "document_viewed",
    visibility: "internal", message: `Viewed ${doc.kind} document (${doc.mime_type}).`,
  });
  if (auditErr) return { error: "Couldn't open this document right now." };

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (error || !data) return { error: "Couldn't open this document." };
  return { url: data.signedUrl };
}

const REFERENCE_ALLOWED_TO: RequestStatus[] = ["in_progress", "awaiting_user_action", "submitted_on_portal", "completed"];

export async function updateRequestStatusAction(input: {
  requestId: string; toStatus: string; message?: string; officialReferenceNumber?: string;
}): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };

  const parsed = adminUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { requestId, toStatus, message, officialReferenceNumber } = parsed.data;

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };

  const { count: confirmationDocs } = await admin
    .from("application_request_documents").select("id", { count: "exact", head: true })
    .eq("request_id", requestId).eq("kind", "confirmation");

  const refToStore = officialReferenceNumber ?? request.official_reference_number;
  const err = validateAdminTransition({
    from: request.status, to: toStatus, message,
    officialReferenceNumber: refToStore, hasConfirmationDocument: (confirmationDocs ?? 0) > 0,
    assistanceType: request.assistance_type,
    deadlinePassed: !!request.application_deadline && isPastDateIST(request.application_deadline),
  });
  if (err) return { error: err };
  if (officialReferenceNumber && !REFERENCE_ALLOWED_TO.includes(toStatus)) {
    return { error: "A reference number can only be added while in progress, awaiting your action, submitted or completed." };
  }

  const now = new Date();
  const terminal = (TERMINAL_STATUSES as RequestStatus[]).includes(toStatus);
  const update: Database["public"]["Tables"]["application_requests"]["Update"] = {
    status: toStatus,
    latest_update: message ?? `Status changed to ${STATUS_LABEL[toStatus]}.`,
    updated_at: now.toISOString(),
  };
  if (message) update.admin_message = message;
  if (officialReferenceNumber) update.official_reference_number = officialReferenceNumber;
  if (toStatus === "awaiting_user_action") update.user_action_note = message;
  if (toStatus === "completed") update.completed_at = now.toISOString();
  // The OFFICIAL stage moves only when submission is confirmed (checked above).
  if (toStatus === "submitted_on_portal") {
    update.official_stage = "submitted";
    update.submitted_on_portal_at = now.toISOString();
  }
  if (terminal) update.purge_after = new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString();

  // Optimistic concurrency: only applies if nobody changed the status since
  // we read it (two admins, or the applicant acting at the same moment).
  const { data: updated, error: updErr } = await admin
    .from("application_requests").update(update).eq("id", requestId).eq("status", request.status).select("id");
  const outcome = interpretConditionalUpdate(updated, updErr);
  if (outcome === "error") return { error: "Couldn't update the request." };
  if (outcome === "conflict") return { error: "This request was just changed by someone else. Refresh and try again." };

  // History rows are written in ONE insert so they succeed or fail together.
  const eventRows: Database["public"]["Tables"]["application_request_events"]["Insert"][] = [{
    request_id: requestId, actor_id: gate.userId, actor_role: "admin",
    event_type: toStatus === "waiting_for_user" ? "info_requested" : "status_changed",
    from_status: request.status, to_status: toStatus, message,
  }];
  if (officialReferenceNumber) {
    eventRows.push({
      request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "reference_added",
      visibility: "user", message: "Official reference number added.",
    });
  }
  const { data: evs, error: evErr } = await admin.from("application_request_events").insert(eventRows).select("id");
  if (evErr || !evs || evs.length === 0) {
    // No audit record = no change: restore the previous values.
    await admin.from("application_requests").update({
      status: request.status, latest_update: request.latest_update, admin_message: request.admin_message,
      official_reference_number: request.official_reference_number, completed_at: request.completed_at,
      purge_after: request.purge_after, user_action_note: request.user_action_note,
      official_stage: request.official_stage, submitted_on_portal_at: request.submitted_on_portal_at,
      updated_at: request.updated_at,
    }).eq("id", requestId).eq("status", toStatus);
    return { error: "Couldn't record the change, so it was not applied. Please try again." };
  }

  const notified = await notifyApplicant(admin, request, evs[0]!.id, statusNotificationBody(toStatus));
  revalidateAll(requestId, request.user_id);
  return notified ? {} : { warning: NOTIFY_WARNING };
}

export async function sendAdminMessageAction(requestId: string, message: string): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const text = message.trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > 2000) return { error: "Message is too long." };

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };
  if ((TERMINAL_STATUSES as RequestStatus[]).includes(request.status)) return { error: "This request is closed." };

  const { data: ev, error } = await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "admin_message", message: text,
  }).select("id").single();
  if (error || !ev) return { error: "Couldn't send the message." };

  const { data: updated, error: updErr } = await admin.from("application_requests")
    .update({ admin_message: text, latest_update: text, updated_at: new Date().toISOString() })
    .eq("id", requestId).eq("status", request.status).select("id");
  if (interpretConditionalUpdate(updated, updErr) !== "ok") {
    await admin.from("application_request_events").delete().eq("id", ev.id); // don't leave a message the request doesn't show
    return { error: "Couldn't send the message — the request may have just changed. Refresh and try again." };
  }

  const notified = await notifyApplicant(admin, request, ev.id, MESSAGE_NOTIFICATION_BODY);
  revalidateAll(requestId, request.user_id);
  return notified ? {} : { warning: NOTIFY_WARNING };
}

/** Admin takes a request (or takes it over from another admin on purpose). */
export async function claimRequestAction(requestId: string, takeOver = false): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const parsed = claimSchema.safeParse({ requestId, takeOver });
  if (!parsed.success) return { error: "Invalid request." };

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("id").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };

  const { data: current } = await admin.from("application_request_assignments")
    .select("admin_id").eq("request_id", requestId).maybeSingle();
  if (current?.admin_id === gate.userId) return {};

  if (!current) {
    const { error } = await admin.from("application_request_assignments").insert({ request_id: requestId, admin_id: gate.userId });
    if (error) {
      return { error: error.code === "23505" ? "Another admin just claimed this request. Refresh to see it." : "Couldn't claim the request." };
    }
  } else {
    if (!parsed.data.takeOver) return { error: "This request is assigned to another admin. Use “Take over” if you are sure." };
    const { data: moved, error } = await admin.from("application_request_assignments")
      .update({ admin_id: gate.userId, assigned_at: new Date().toISOString() })
      .eq("request_id", requestId).eq("admin_id", current.admin_id).select("request_id");
    if (interpretConditionalUpdate(moved, error) !== "ok") return { error: "The assignment just changed. Refresh and try again." };
  }

  const { error: evErr } = await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "admin_claimed", visibility: "internal",
    message: current ? "Request taken over from another admin." : "Request claimed.",
  });
  if (evErr) {
    // Audit or nothing: undo the assignment.
    if (current) await admin.from("application_request_assignments").update({ admin_id: current.admin_id }).eq("request_id", requestId).eq("admin_id", gate.userId);
    else await admin.from("application_request_assignments").delete().eq("request_id", requestId).eq("admin_id", gate.userId);
    return { error: "Couldn't record the assignment, so it was not saved. Please try again." };
  }
  revalidatePath(`/admin/application-requests/${requestId}`);
  return {};
}

export async function releaseRequestAction(requestId: string): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const parsed = claimSchema.safeParse({ requestId });
  if (!parsed.success) return { error: "Invalid request." };
  const admin = createAdminClient();
  const { data: removed, error } = await admin.from("application_request_assignments")
    .delete().eq("request_id", requestId).eq("admin_id", gate.userId).select("request_id");
  if (error) return { error: "Couldn't release the request." };
  if (!removed || removed.length === 0) return { error: "This request isn't assigned to you." };
  await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "admin_claimed", visibility: "internal",
    message: "Request released.",
  });
  revalidatePath(`/admin/application-requests/${requestId}`);
  return {};
}

/** Marks that manual form filling has begun (timeline: "Form Filling Started").
 *  No status change: the request is already in progress. Once per request. */
export async function startFormFillingAction(requestId: string): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const parsed = claimSchema.safeParse({ requestId });
  if (!parsed.success) return { error: "Invalid request." };

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };
  if (request.status !== "in_progress") return { error: "Form filling can only start while the request is In Progress." };
  if (request.assistance_type !== "full_application") return { error: "This request type doesn't involve filling the form." };

  const { count } = await admin.from("application_request_events")
    .select("id", { count: "exact", head: true }).eq("request_id", requestId).eq("event_type", "form_filling_started");
  if ((count ?? 0) > 0) return { error: "Form filling was already marked as started." };

  const { data: ev, error } = await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "form_filling_started",
    message: "An admin has started filling your form.",
  }).select("id").single();
  if (error || !ev) return { error: "Couldn't record that. Please try again." };

  const notified = await notifyApplicant(admin, request, ev.id, FORM_FILLING_NOTIFICATION_BODY);
  revalidateAll(requestId, request.user_id);
  return notified ? {} : { warning: NOTIFY_WARNING };
}

/** Records a later OFFICIAL exam stage (admit card, exam, answer key, result)
 *  by hand — for an official notice the monitoring pipeline hasn't picked up.
 *  Only after official submission was confirmed, and only forward. */
export async function setOfficialStageAction(input: { requestId: string; stage: string; message?: string }): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const parsed = officialStageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { requestId, stage, message } = parsed.data;

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };
  if (!isOfficiallySubmitted(request.status)) {
    return { error: "Official exam stages can only be recorded after the application is confirmed as submitted on the portal." };
  }
  if (!canAdvanceOfficialStage(request.official_stage, stage)) {
    return { error: "That stage isn't ahead of the current official stage." };
  }

  const { data: updated, error: updErr } = await admin.from("application_requests")
    .update({ official_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", requestId).eq("official_stage", request.official_stage).select("id");
  const outcome = interpretConditionalUpdate(updated, updErr);
  if (outcome === "conflict") return { error: "The stage was just changed by someone else. Refresh and try again." };
  if (outcome === "error") return { error: "Couldn't update the stage." };

  const { data: ev, error: evErr } = await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "official_update",
    official_stage: stage, message: message ?? `${OFFICIAL_STAGE_LABEL[stage]} (recorded by an admin from an official notice).`,
  }).select("id").single();
  if (evErr || !ev) {
    await admin.from("application_requests")
      .update({ official_stage: request.official_stage, updated_at: request.updated_at })
      .eq("id", requestId).eq("official_stage", stage);
    return { error: "Couldn't record the change, so it was not applied. Please try again." };
  }

  const notified = await notifyApplicant(admin, request, ev.id, OFFICIAL_STAGE_NOTIFICATION_BODY);
  revalidateAll(requestId, request.user_id);
  return notified ? {} : { warning: NOTIFY_WARNING };
}

/** Links a request to the correct, PUBLISHED exam cycle so verified official
 *  updates reach it. Doesn't overwrite what the applicant entered. */
export async function linkRequestCycleAction(requestId: string, examCycleId: string): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const parsed = linkCycleSchema.safeParse({ requestId, examCycleId });
  if (!parsed.success) return { error: "Enter a valid exam cycle ID." };

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };
  if ((TERMINAL_STATUSES as RequestStatus[]).includes(request.status)) return { error: "This request is closed." };

  const { data: cycle } = await admin.from("exam_cycles").select("id, cycle_label, status").eq("id", examCycleId).maybeSingle();
  if (!cycle) return { error: "No exam cycle with that ID." };
  if (cycle.status !== "published") return { error: "Only a published exam cycle can be linked." };

  const { error } = await admin.from("application_requests")
    .update({ exam_cycle_id: cycle.id, cycle_label: cycle.cycle_label, updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: "Couldn't link the cycle." };
  const { error: evErr } = await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "cycle_linked",
    message: `Linked to ${cycle.cycle_label}. Verified official updates for this cycle will appear here.`,
  });
  if (evErr) {
    await admin.from("application_requests")
      .update({ exam_cycle_id: request.exam_cycle_id, cycle_label: request.cycle_label, updated_at: request.updated_at })
      .eq("id", requestId);
    return { error: "Couldn't record the change, so it was not applied. Please try again." };
  }
  revalidateAll(requestId, request.user_id);
  return {};
}

export async function addInternalNoteAction(requestId: string, note: string): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const parsed = internalNoteSchema.safeParse({ requestId, note });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid note." };

  const admin = createAdminClient();
  const { data: exists } = await admin.from("application_requests").select("id").eq("id", requestId).maybeSingle();
  if (!exists) return { error: "Request not found." };
  const { error } = await admin.from("application_request_events").insert({
    request_id: requestId, actor_id: gate.userId, actor_role: "admin", event_type: "internal_note",
    visibility: "internal", message: parsed.data.note,
  });
  if (error) return { error: "Couldn't save the note." };
  revalidatePath(`/admin/application-requests/${requestId}`);
  return {};
}

/** Admin attaches the official confirmation (e.g. acknowledgment PDF). Only
 *  while in progress / completed, so it can't be added to a request that
 *  was never actually processed. */
export async function uploadConfirmationDocumentAction(formData: FormData): Promise<AdminActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };

  const requestId = String(formData.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "Invalid request." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const meta = validateUploadMeta(file.size, file.type);
  if ("error" in meta) return { error: meta.error };
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!bytesMatchMime(head, meta.mime)) return { error: "The file's contents don't match its type." };

  const admin = createAdminClient();
  const { data: request } = await admin.from("application_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return { error: "Request not found." };
  if (!["in_progress", "awaiting_user_action", "submitted_on_portal", "completed"].includes(request.status)) {
    return { error: "Confirmation documents can only be added once the request is in progress (or later)." };
  }

  // Deliberately NOT under <user_id>/...: the storage RLS policies let a user
  // delete anything in their own folder through the Storage API, and an
  // official confirmation must not be removable by the applicant. This path
  // matches no user policy, so only the service role can touch it; the
  // applicant reads it through getMyDocumentUrlAction after an ownership check.
  const path = `admin-confirmations/${request.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: meta.mime, upsert: false });
  if (upErr) return { error: "Couldn't upload the file." };

  const { error: docErr } = await admin.from("application_request_documents").insert({
    request_id: request.id, user_id: request.user_id, kind: "confirmation", uploaded_by: "admin",
    purpose: "Official confirmation", storage_path: path, file_name: file.name.slice(0, 255),
    mime_type: meta.mime, size_bytes: file.size,
  });
  if (docErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Couldn't save the document." };
  }
  const { data: ev, error: evErr } = await admin.from("application_request_events").insert({
    request_id: request.id, actor_id: gate.userId, actor_role: "admin", event_type: "confirmation_uploaded",
    message: "Confirmation document added.",
  }).select("id").single();
  if (evErr || !ev) {
    // Keep file, metadata and history consistent: undo the upload.
    await admin.from("application_request_documents").delete().eq("storage_path", path);
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Couldn't record the upload, so it was not saved. Please try again." };
  }
  const notified = await notifyApplicant(admin, request, ev.id, CONFIRMATION_NOTIFICATION_BODY);
  revalidateAll(request.id, request.user_id);
  return notified ? {} : { warning: NOTIFY_WARNING };
}
