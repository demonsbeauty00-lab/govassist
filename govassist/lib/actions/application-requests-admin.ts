"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import {
  REQUEST_STATUSES, RETENTION_DAYS, SIGNED_URL_SECONDS, STATUS_LABEL, TERMINAL_STATUSES, type RequestStatus,
} from "@/lib/application-requests/constants";
import { adminListFilterSchema, adminUpdateSchema, internalNoteSchema } from "@/lib/application-requests/schema";
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

async function notifyApplicant(
  admin: ReturnType<typeof createAdminClient>,
  request: Pick<RequestRow, "id" | "user_id" | "request_code">,
  eventId: string,
  body: string,
) {
  // Best-effort and deduplicated per event (see 0013_notification_dedupe).
  await admin.from("notifications").upsert(
    {
      user_id: request.user_id,
      title: `Update on your request ${request.request_code}`,
      body: body.slice(0, 300),
      type: "system" as const,
      dedupe_key: `apprequest:${request.id}:${eventId}`,
    },
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
}

export async function getRequestCountsAction(): Promise<{ error?: string; counts: Record<RequestStatus, number> }> {
  const empty = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error, counts: empty };
  const admin = createAdminClient();
  const { data, error } = await admin.from("application_requests").select("status");
  if (error) return { error: "Couldn't load counts.", counts: empty };
  for (const row of data ?? []) {
  const status = row.status as RequestStatus;
  if (REQUEST_STATUSES.includes(status)) {
    empty[status] += 1;
  }
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
  const [{ data: events }, { data: documents }] = await Promise.all([
    admin.from("application_request_events").select("*").eq("request_id", requestId).order("created_at", { ascending: false }),
    admin.from("application_request_documents").select("*").eq("request_id", requestId).order("created_at", { ascending: true }),
  ]);
  return { request, events: events ?? [], documents: documents ?? [] };
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

export async function updateRequestStatusAction(input: {
  requestId: string; toStatus: string; message?: string; officialReferenceNumber?: string;
}): Promise<{ error?: string }> {
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
  });
  if (err) return { error: err };
  if (officialReferenceNumber && toStatus !== "in_progress" && toStatus !== "completed") {
    return { error: "A reference number can only be added while in progress or when completing." };
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
  if (toStatus === "completed") update.completed_at = now.toISOString();
  if (terminal) update.purge_after = new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString();

  // Optimistic concurrency: only applies if nobody changed the status since
  // we read it (two admins, or the applicant cancelling at the same moment).
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
      purge_after: request.purge_after, updated_at: request.updated_at,
    }).eq("id", requestId).eq("status", toStatus);
    return { error: "Couldn't record the change, so it was not applied. Please try again." };
  }

  const body = message ? `${STATUS_LABEL[toStatus]}: ${message}` : `Status is now ${STATUS_LABEL[toStatus]}.`;
  await notifyApplicant(admin, request, evs[0]!.id, body);
  revalidateAll(requestId, request.user_id);
  return {};
}

export async function sendAdminMessageAction(requestId: string, message: string): Promise<{ error?: string }> {
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

  await notifyApplicant(admin, request, ev.id, text);
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
export async function uploadConfirmationDocumentAction(formData: FormData): Promise<{ error?: string }> {
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
  if (request.status !== "in_progress" && request.status !== "completed") {
    return { error: "Confirmation documents can only be added while in progress or completed." };
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
  await notifyApplicant(admin, request, ev.id, "A confirmation document was added to your request.");
  revalidateAll(request.id, request.user_id);
  return {};
}
