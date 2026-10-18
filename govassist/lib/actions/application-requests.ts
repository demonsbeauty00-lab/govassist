"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { demoExamCycles } from "@/lib/mock-data";
import type { Database } from "@/lib/supabase/database.types";
import {
  ACTIVE_STATUSES, CONSENT_VERSION, MAX_FILES_PER_REQUEST, RETENTION_DAYS, SIGNED_URL_SECONDS,
  TERMINAL_STATUSES, type RequestStatus,
} from "@/lib/application-requests/constants";
import {
  actionDoneSchema, createRequestSchema, examKeyFor, requestChangesSchema, todayIST, userReplySchema,
} from "@/lib/application-requests/schema";
import { canUserCancel, canUserCompleteAction, canUserReply, canUserReviewForm } from "@/lib/application-requests/transitions";
import { bytesMatchMime, safeFileName, sniffMime, validateUploadMeta } from "@/lib/application-requests/file-validation";
import { MAX_FILE_BYTES } from "@/lib/application-requests/constants";
import { isOwner } from "@/lib/application-requests/authz";
import { applicantDeletableDocuments, interpretConditionalUpdate } from "@/lib/application-requests/workflow";
import { buildStatusNotification } from "@/lib/application-requests/notify-text";
import { notifyRequestUser, supabaseRequestNotificationStore } from "@/lib/application-requests/notify";

const BUCKET = "documents"; // existing PRIVATE bucket; owner-only storage RLS (0001)
const MAX_ACTIVE_REQUESTS_PER_USER = 10;

/** createAdminClient() throws when the service-role env vars are missing.
 *  Actions that need it call this BEFORE writing anything, so a missing
 *  config can never leave a half-finished change behind. */
function tryAdminClient(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
const UNAVAILABLE = "This action is temporarily unavailable. Please try again later.";

export type RequestRow = Database["public"]["Tables"]["application_requests"]["Row"];
export type RequestDocumentRow = Database["public"]["Tables"]["application_request_documents"]["Row"];
export type RequestEventRow = Database["public"]["Tables"]["application_request_events"]["Row"];

export interface RequestDetail {
  request: RequestRow;
  events: RequestEventRow[];
  documents: RequestDocumentRow[];
}

export interface CreateRequestResult {
  error?: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}

function revalidateRequests(id?: string) {
  revalidatePath("/apply-assistant");
  if (id) revalidatePath(`/apply-assistant/${id}`);
}

/** Reads + validates every uploaded file (size, type, real file signature).
 *  Returns validated entries or a user-safe error. */
async function readValidatedFiles(
  formData: FormData,
  maxFiles: number,
): Promise<{ error: string } | { files: { file: File; mime: "application/pdf" | "image/jpeg" | "image/png" }[] }> {
  const raw = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (raw.length > maxFiles) return { error: `You can attach at most ${maxFiles} files.` };
  const files: { file: File; mime: "application/pdf" | "image/jpeg" | "image/png" }[] = [];
  for (const file of raw) {
    const meta = validateUploadMeta(file.size, file.type);
    if ("error" in meta) return { error: meta.error };
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (!bytesMatchMime(head, meta.mime)) return { error: "A file's contents don't match its type. Use a real PDF, JPG or PNG." };
    files.push({ file, mime: meta.mime });
  }
  return { files };
}

interface UploadedItem { path: string; name: string; size: number; mime: "application/pdf" | "image/jpeg" | "image/png"; purpose: string }

type UserSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** Copies the applicant's own vault documents into the request folder. */
async function copyVaultDocuments(
  supabase: UserSupabase,
  userId: string,
  requestId: string,
  ids: string[],
): Promise<{ error: string } | { items: UploadedItem[] }> {
  const unique = Array.from(new Set(ids));
  // RLS + explicit user_id filter: only the caller's own documents can match.
  const { data: docs } = await supabase
    .from("documents").select("id, document_type, storage_path, file_name").in("id", unique).eq("user_id", userId);
  const usable = (docs ?? []).filter((d) => !!d.storage_path);
  if (usable.length !== unique.length) {
    return { error: "One of the saved documents is no longer available. Remove it and try again." };
  }
  const items: UploadedItem[] = [];
  const fail = async (error: string) => {
    if (items.length) await supabase.storage.from(BUCKET).remove(items.map((i) => i.path));
    return { error };
  };
  for (const d of usable) {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(d.storage_path as string);
    if (dlErr || !blob) return fail("Couldn't read one of your saved documents. Please try again.");
    if (blob.size <= 0 || blob.size > MAX_FILE_BYTES) {
      return fail(`Each file must be under ${MAX_FILE_BYTES / (1024 * 1024)}MB. A saved document is too large to attach.`);
    }
    const mime = sniffMime(new Uint8Array(await blob.slice(0, 8).arrayBuffer()));
    if (!mime) return fail("A saved document isn't a real PDF, JPG or PNG, so it can't be attached.");
    const name = d.file_name ?? `${d.document_type}`;
    const path = `${userId}/application-requests/${requestId}/${crypto.randomUUID()}-${safeFileName(name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
    if (upErr) return fail("Couldn't attach a saved document. Please try again.");
    items.push({ path, name, size: blob.size, mime, purpose: "From your saved documents" });
  }
  return { items };
}

export async function createApplicationRequestAction(formData: FormData): Promise<CreateRequestResult> {
  const auth = await requireUser();
  if (!auth.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = auth;

  const parsed = createRequestSchema.safeParse({
    examSlug: String(formData.get("examSlug") ?? ""),
    customExamTitle: String(formData.get("customExamTitle") ?? ""),
    notificationUrl: String(formData.get("notificationUrl") ?? ""),
    applicationDeadline: String(formData.get("applicationDeadline") ?? ""),
    officialApplicationUrl: String(formData.get("officialApplicationUrl") ?? ""),
    cycleLabel: String(formData.get("cycleLabel") ?? ""),
    examCycleId: String(formData.get("examCycleId") ?? ""),
    vaultDocumentIds: formData.getAll("vaultDocumentIds").map(String).filter(Boolean),
    postApplied: String(formData.get("postApplied") ?? ""),
    assistanceType: String(formData.get("assistanceType") ?? ""),
    applicantName: String(formData.get("applicantName") ?? ""),
    applicantPhone: String(formData.get("applicantPhone") ?? ""),
    details: String(formData.get("details") ?? ""),
    consent: formData.get("consent") === "on" || formData.get("consent") === "true",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  // Never trust a client-supplied exam title when a catalog exam was chosen.
  let examTitle = input.customExamTitle ?? "";
  const notificationUrl = input.notificationUrl;
  const deadline = input.applicationDeadline;
  let examSlug: string | null = null;
  let examCycleId: string | null = null;
  let cycleLabel: string | null = input.cycleLabel;
  if (input.examCycleId) {
    // A real, published exam cycle: the exam name, slug and cycle label all
    // come from the database, never from the form, so the link is to the
    // correct cycle (verified official updates are matched on this id).
    const { data: cycle } = await supabase
      .from("exam_cycles").select("id, exam_id, cycle_label, status, application_end_date").eq("id", input.examCycleId).maybeSingle();
    if (!cycle || cycle.status !== "published") {
      return { error: "That exam cycle isn't available.", fieldErrors: { examCycleId: "Choose a listed cycle." } };
    }
    // Phase 16: the verified application window for this cycle has closed — don't take a request
    // that cannot be completed. (A later verified deadline extension updates the cycle and reopens this.)
    if (cycle.application_end_date && cycle.application_end_date < todayIST()) {
      return {
        error: `Applications for this cycle closed on ${cycle.application_end_date}. If the official last date has been extended, we will list it once it is verified.`,
        fieldErrors: { examCycleId: "The application window for this cycle has closed." },
      };
    }
    const { data: exam } = await supabase.from("exams").select("slug, short_name").eq("id", cycle.exam_id).maybeSingle();
    if (!exam) return { error: "That exam cycle isn't available.", fieldErrors: { examCycleId: "Choose a listed cycle." } };
    examCycleId = cycle.id;
    cycleLabel = cycle.cycle_label;
    examSlug = exam.slug;
    examTitle = exam.short_name;
  } else if (input.examSlug) {
    const exam = demoExamCycles.find((e) => e.id === input.examSlug);
    if (!exam) return { error: "That exam isn't available.", fieldErrors: { examSlug: "Choose a listed exam." } };
    // The catalogue is DEMO/sample data (see lib/mock-data.ts), so only the
    // exam NAME is taken from it. Its dates and URLs are never copied into a
    // real request; the notification link and deadline stay exactly what the
    // applicant entered (or empty) for the admin to verify. Such a request is
    // NOT linked to a cycle, so it receives no automatic official updates
    // until an admin links the correct cycle.
    examSlug = exam.id;
    examTitle = exam.shortName;
  }
  const examKey = examKeyFor(examSlug, examTitle);

  const filesResult = await readValidatedFiles(formData, MAX_FILES_PER_REQUEST);
  if ("error" in filesResult) return { error: filesResult.error, fieldErrors: { files: filesResult.error } };
  if (filesResult.files.length + input.vaultDocumentIds.length > MAX_FILES_PER_REQUEST) {
    const msg = `You can attach at most ${MAX_FILES_PER_REQUEST} files in total (uploads + saved documents).`;
    return { error: msg, fieldErrors: { files: msg } };
  }
  if (input.assistanceType === "document_check" && filesResult.files.length + input.vaultDocumentIds.length === 0) {
    const msg = "A document check needs at least one document — upload one or pick a saved document.";
    return { error: msg, fieldErrors: { files: msg } };
  }

  // Duplicate protection #1 (friendly message). #2 is the partial unique
  // index in the database, which also covers two simultaneous clicks.
  const { data: active } = await supabase
    .from("application_requests")
    .select("id, exam_key, assistance_type")
    .eq("user_id", user.id)
    .in("status", ACTIVE_STATUSES);
  if ((active ?? []).some((r) => r.exam_key === examKey && r.assistance_type === input.assistanceType)) {
    return { error: "You already have an open request for this exam and assistance type. Open it from your list instead." };
  }
  if ((active ?? []).length >= MAX_ACTIVE_REQUESTS_PER_USER) {
    return { error: "You have too many open requests. Please wait for some to be completed." };
  }

  const requestId = crypto.randomUUID();
  const uploaded: UploadedItem[] = [];
  const cleanupUploads = () =>
    uploaded.length ? supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path)) : Promise.resolve();

  for (const { file, mime } of filesResult.files) {
    const path = `${user.id}/application-requests/${requestId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (upErr) {
      await cleanupUploads();
      return { error: "Couldn't upload a file. Please try again." };
    }
    uploaded.push({ path, name: file.name, size: file.size, mime, purpose: "Supporting document for this request" });
  }

  // Reuse documents the applicant already keeps in their private vault: the
  // file is copied (never shared by path) into this request's own folder,
  // after an ownership check and the same size / real-type validation.
  if (input.vaultDocumentIds.length > 0) {
    const copied = await copyVaultDocuments(supabase, user.id, requestId, input.vaultDocumentIds);
    if ("error" in copied) {
      await cleanupUploads();
      return { error: copied.error, fieldErrors: { vaultDocumentIds: copied.error } };
    }
    uploaded.push(...copied.items);
  }

  const { error: insertErr } = await supabase.from("application_requests").insert({
    id: requestId,
    user_id: user.id,
    exam_slug: examSlug,
    exam_title: examTitle,
    exam_key: examKey,
    notification_url: notificationUrl,
    official_application_url: input.officialApplicationUrl,
    exam_cycle_id: examCycleId,
    cycle_label: cycleLabel,
    application_deadline: deadline,
    post_applied: input.postApplied,
    assistance_type: input.assistanceType,
    applicant_name: input.applicantName,
    applicant_phone: input.applicantPhone,
    details: input.details,
    consent_accepted_at: new Date().toISOString(),
    consent_version: CONSENT_VERSION,
    latest_update: "Request submitted. An admin will review it soon.",
  });
  if (insertErr) {
    await cleanupUploads();
    if (insertErr.code === "23505" && insertErr.message.includes("uq_application_requests_active")) {
      return { error: "You already have an open request for this exam and assistance type." };
    }
    return { error: "Couldn't submit your request. Please try again." };
  }

  if (uploaded.length) {
    const { error: docErr } = await supabase.from("application_request_documents").insert(
      uploaded.map((u) => ({
        request_id: requestId,
        user_id: user.id,
        file_name: u.name.slice(0, 255),
        mime_type: u.mime,
        size_bytes: u.size,
        storage_path: u.path,
        purpose: u.purpose,
      })),
    );
    if (docErr) {
      await cleanupUploads();
      await supabase.from("application_request_events").insert({
        request_id: requestId, actor_id: user.id, actor_role: "user", event_type: "submitted",
        message: "Request submitted, but the attached files could not be saved. Please re-attach them in a reply.",
      });
      revalidateRequests(requestId);
      return { requestId, error: "Your request was submitted, but your files couldn't be saved. Open it and attach them again." };
    }
  }

  await supabase.from("application_request_events").insert({
    request_id: requestId, actor_id: user.id, actor_role: "user", event_type: "submitted",
    to_status: "submitted", message: "Request submitted.",
  });

  // In-app notification with the assistance number. Best-effort: the request
  // is already saved, so a failure here must never fail the submission. Goes
  // through the shared helper (preferences + dedupe) and says plainly that
  // nothing has been submitted on the official portal.
  try {
    const { data: row } = await supabase.from("application_requests").select("request_code").eq("id", requestId).maybeSingle();
    const content = buildStatusNotification({ status: "submitted", requestCode: row?.request_code ?? "", officiallySubmitted: false });
    await notifyRequestUser({
      store: supabaseRequestNotificationStore(createAdminClient()),
      userId: user.id,
      requestId,
      dedupeSuffix: "submitted",
      event: "APPLICATION_REQUEST_SUBMITTED",
      title: content.title.trim(),
      body: content.body,
    });
  } catch {
    // ignore — notification is a convenience, not part of the submission
  }

  revalidateRequests(requestId);
  return { requestId };
}

export async function listMyRequestsAction(): Promise<{ error?: string; requests: RequestRow[] }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, requests: [] };
  const { data, error } = await auth.supabase
    .from("application_requests")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) return { error: "Couldn't load your requests.", requests: [] };
  return { requests: data ?? [] };
}

export async function getMyRequestAction(requestId: string): Promise<RequestDetail | null> {
  const auth = await requireUser();
  if (!auth.ok) return null;
  const { supabase, user } = auth;

  const { data: request } = await supabase
    .from("application_requests").select("*").eq("id", requestId).eq("user_id", user.id).maybeSingle();
  if (!isOwner(request, user.id) || !request) return null;

  const [{ data: events }, { data: documents }] = await Promise.all([
    // RLS already hides internal events; the filter keeps that explicit.
    supabase.from("application_request_events").select("*").eq("request_id", requestId).eq("visibility", "user").order("created_at", { ascending: false }),
    supabase.from("application_request_documents").select("*").eq("request_id", requestId).order("created_at", { ascending: true }),
  ]);
  return { request, events: events ?? [], documents: documents ?? [] };
}

export async function getMyDocumentUrlAction(documentId: string): Promise<{ url?: string; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = auth;

  // Ownership is checked first (RLS + explicit check) — a signed URL is only
  // ever created for a document row that belongs to the caller.
  const { data: doc } = await supabase
    .from("application_request_documents").select("storage_path, user_id, uploaded_by").eq("id", documentId).maybeSingle();
  if (!isOwner(doc, user.id) || !doc) return { error: "Document not found." };

  // Admin-uploaded confirmations live outside the applicant's storage folder
  // (see uploadConfirmationDocumentAction), so they're signed server-side.
  let storage = supabase.storage;
  if (doc.uploaded_by === "admin") {
    const admin = tryAdminClient();
    if (!admin) return { error: UNAVAILABLE };
    storage = admin.storage;
  }
  const { data, error } = await storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (error || !data) return { error: "Couldn't open this document." };
  return { url: data.signedUrl };
}

async function loadOwnedRequest(requestId: string) {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false as const, error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { data: request } = await auth.supabase
    .from("application_requests").select("*").eq("id", requestId).eq("user_id", auth.user.id).maybeSingle();
  if (!isOwner(request, auth.user.id) || !request) return { ok: false as const, error: "Request not found." };
  return { ok: true as const, supabase: auth.supabase, user: auth.user, request };
}

export async function replyToRequestAction(formData: FormData): Promise<{ error?: string }> {
  const parsed = userReplySchema.safeParse({
    requestId: String(formData.get("requestId") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid reply." };

  const loaded = await loadOwnedRequest(parsed.data.requestId);
  if (!loaded.ok) return { error: loaded.error };
  const { supabase, user, request } = loaded;
  if (!canUserReply(request.status)) return { error: "This request isn't waiting for your reply." };

  // Needed for the status change and for rollback — check it up front.
  const admin = tryAdminClient();
  if (!admin) return { error: UNAVAILABLE };

  const { count } = await supabase
    .from("application_request_documents").select("id", { count: "exact", head: true }).eq("request_id", request.id).eq("uploaded_by", "user");
  const room = Math.max(0, MAX_FILES_PER_REQUEST * 2 - (count ?? 0));
  const filesResult = await readValidatedFiles(formData, room);
  if ("error" in filesResult) return { error: filesResult.error };

  const uploaded: { path: string; file: File; mime: "application/pdf" | "image/jpeg" | "image/png" }[] = [];
  for (const { file, mime } of filesResult.files) {
    const path = `${user.id}/application-requests/${request.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (upErr) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      return { error: "Couldn't upload a file. Please try again." };
    }
    uploaded.push({ path, file, mime });
  }

  // Undoes everything saved so far for this reply (files, their rows, and
  // the reply event) so a failed status change never leaves a reply behind
  // that the request's status doesn't reflect.
  let docIds: string[] = [];
  let replyEventId: string | null = null;
  const rollback = async () => {
    if (replyEventId) await admin.from("application_request_events").delete().eq("id", replyEventId);
    if (docIds.length) await admin.from("application_request_documents").delete().in("id", docIds);
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
  };

  if (uploaded.length) {
    const { data: docRows, error: docErr } = await supabase.from("application_request_documents").insert(
      uploaded.map((u) => ({
        request_id: request.id, user_id: user.id, file_name: u.file.name.slice(0, 255), mime_type: u.mime,
        size_bytes: u.file.size, storage_path: u.path, purpose: "Added in reply to admin",
      })),
    ).select("id");
    if (docErr || !docRows) {
      await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      return { error: "Couldn't save your files. Please try again." };
    }
    docIds = docRows.map((d: { id: string }) => d.id);
  }

  const { data: replyEvent, error: evErr } = await supabase.from("application_request_events").insert({
    request_id: request.id, actor_id: user.id, actor_role: "user", event_type: "user_reply", message: parsed.data.message,
  }).select("id").single();
  if (evErr || !replyEvent) {
    await rollback();
    return { error: "Couldn't send your reply. Please try again." };
  }
  replyEventId = replyEvent.id;

  // Status change: users have no UPDATE policy on purpose, so this one narrow
  // change runs with the service role AFTER the ownership + status checks
  // above, and only applies if the request is STILL waiting_for_user.
  const { data: changed, error: updErr } = await admin
    .from("application_requests")
    .update({ status: "under_review", latest_update: "You replied. Waiting for an admin to review.", updated_at: new Date().toISOString() })
    .eq("id", request.id).eq("user_id", user.id).eq("status", "waiting_for_user")
    .select("id");
  const outcome = interpretConditionalUpdate(changed, updErr);
  if (outcome !== "ok") {
    await rollback();
    return {
      error: outcome === "conflict"
        ? "This request was just updated and no longer needs your reply. Refresh to see its latest status."
        : "Couldn't send your reply. Please try again.",
    };
  }

  // Only reached when the transition really happened, so exactly one
  // status_changed event is written per real change. It is an audit
  // record: if it fails the reply itself is still valid, so log and go on.
  const { error: statusEvErr } = await admin.from("application_request_events").insert({
    request_id: request.id, actor_id: user.id, actor_role: "system", event_type: "status_changed",
    from_status: "waiting_for_user", to_status: "under_review",
  });
  if (statusEvErr) console.error("application_requests: status_changed audit insert failed", statusEvErr.code);

  revalidateRequests(request.id);
  return {};
}

export async function cancelMyRequestAction(requestId: string): Promise<{ error?: string }> {
  const loaded = await loadOwnedRequest(requestId);
  if (!loaded.ok) return { error: loaded.error };
  const { user, request } = loaded;
  if (!canUserCancel(request.status)) return { error: "This request can no longer be cancelled by you." };

  const admin = tryAdminClient();
  if (!admin) return { error: UNAVAILABLE };

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString();
  const { data: updated, error } = await admin
    .from("application_requests")
    .update({ status: "cancelled", latest_update: "You cancelled this request.", purge_after: purgeAfter, updated_at: now.toISOString() })
    .eq("id", request.id).eq("user_id", user.id).eq("status", request.status)
    .select("id");
  const outcome = interpretConditionalUpdate(updated, error);
  if (outcome === "conflict") return { error: "This request was just updated. Refresh and try again." };
  if (outcome === "error") return { error: "Couldn't cancel. Please try again." };

  const { error: evErr } = await admin.from("application_request_events").insert({
    request_id: request.id, actor_id: user.id, actor_role: "user", event_type: "cancelled_by_user",
    from_status: request.status, to_status: "cancelled",
  });
  if (evErr) {
    // No audit record = no cancellation: put the request back as it was.
    await admin.from("application_requests")
      .update({ status: request.status, latest_update: request.latest_update, purge_after: request.purge_after, updated_at: request.updated_at })
      .eq("id", request.id).eq("status", "cancelled");
    return { error: "Couldn't cancel. Please try again." };
  }
  revalidateRequests(request.id);
  return {};
}

/** Applicant-initiated deletion of THEIR OWN uploaded files, allowed once
 *  the request is closed. Admin-uploaded confirmation documents, the
 *  request record and its history are never touched. Safe to retry: if the
 *  files were removed but the database cleanup failed, running it again
 *  finishes the job. */
export async function deleteMyRequestDocumentsAction(requestId: string): Promise<{ error?: string }> {
  const loaded = await loadOwnedRequest(requestId);
  if (!loaded.ok) return { error: loaded.error };
  const { supabase, user, request } = loaded;
  if (!(TERMINAL_STATUSES as RequestStatus[]).includes(request.status)) {
    return { error: "You can delete your documents once the request is closed." };
  }

  const admin = tryAdminClient();
  if (!admin) return { error: UNAVAILABLE };

  const { data: allDocs, error: listErr } = await supabase
    .from("application_request_documents")
    .select("id, storage_path, uploaded_by, kind")
    .eq("request_id", request.id)
    .eq("user_id", user.id);
  if (listErr) return { error: "Couldn't load your documents. Please try again." };

  const docs = applicantDeletableDocuments(allDocs ?? []);
  if (docs.length === 0) return { error: "There are no documents uploaded by you on this request." };

  const { error: rmErr } = await supabase.storage.from(BUCKET).remove(docs.map((d) => d.storage_path));
  if (rmErr) return { error: "Couldn't delete your documents. Please try again." };

  const { error: delErr } = await admin
    .from("application_request_documents")
    .delete()
    .in("id", docs.map((d) => d.id))
    .eq("request_id", request.id)
    .eq("user_id", user.id)
    .eq("uploaded_by", "user")
    .eq("kind", "supporting");
  if (delErr) return { error: "Your files were removed but cleanup didn't finish. Please press delete again." };

  const { error: evErr } = await admin.from("application_request_events").insert({
    request_id: request.id, actor_id: user.id, actor_role: "user", event_type: "documents_deleted",
    message: `${docs.length} document(s) deleted by applicant.`,
  });
  if (evErr) console.error("application_requests: documents_deleted audit insert failed", evErr.code);

  revalidateRequests(request.id);
  return {};
}

// ---------------------------------------------------------------------------
// Phase 11 — applicant steps in the manual form-filling workflow.
// Users have no UPDATE policy, so each narrow change runs with the service
// role AFTER ownership + current-status checks, as a conditional update with
// an audit event and a compensating revert if the event can't be written.
// ---------------------------------------------------------------------------

async function applicantTransition(args: {
  admin: NonNullable<ReturnType<typeof tryAdminClient>>;
  userId: string;
  request: RequestRow;
  to: RequestStatus;
  latestUpdate: string;
  eventType: "user_review_approved" | "user_changes_requested" | "user_action_completed";
  message: string | null;
}): Promise<{ error?: string }> {
  const { admin, userId, request, to } = args;
  const { data: changed, error } = await admin
    .from("application_requests")
    .update({ status: to, latest_update: args.latestUpdate, updated_at: new Date().toISOString() })
    .eq("id", request.id).eq("user_id", userId).eq("status", request.status)
    .select("id");
  const outcome = interpretConditionalUpdate(changed, error);
  if (outcome === "conflict") return { error: "This request was just updated. Refresh to see its latest status." };
  if (outcome === "error") return { error: "Couldn't save that. Please try again." };

  const { error: evErr } = await admin.from("application_request_events").insert({
    request_id: request.id, actor_id: userId, actor_role: "user", event_type: args.eventType,
    from_status: request.status, to_status: to, message: args.message,
  });
  if (evErr) {
    await admin.from("application_requests")
      .update({ status: request.status, latest_update: request.latest_update, updated_at: request.updated_at })
      .eq("id", request.id).eq("status", to);
    return { error: "Couldn't save that. Please try again." };
  }
  return {};
}

/** Applicant reviewed the filled form and is happy: now THEY handle the
 *  declaration / payment / OTP / CAPTCHA / final submit on the official portal. */
export async function approveFilledFormAction(requestId: string): Promise<{ error?: string }> {
  const loaded = await loadOwnedRequest(requestId);
  if (!loaded.ok) return { error: loaded.error };
  const { user, request } = loaded;
  if (!canUserReviewForm(request.status)) return { error: "This request isn't waiting for your review." };
  const admin = tryAdminClient();
  if (!admin) return { error: UNAVAILABLE };

  const res = await applicantTransition({
    admin, userId: user.id, request, to: "awaiting_user_action",
    latestUpdate: "You approved the filled form. Complete the remaining steps on the official portal yourself, then tell us here.",
    eventType: "user_review_approved", message: null,
  });
  if (!res.error) revalidateRequests(request.id);
  return res;
}

export async function requestFormChangesAction(requestId: string, message: string): Promise<{ error?: string }> {
  const parsed = requestChangesSchema.safeParse({ requestId, message });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Describe the change you need." };
  const loaded = await loadOwnedRequest(parsed.data.requestId);
  if (!loaded.ok) return { error: loaded.error };
  const { user, request } = loaded;
  if (!canUserReviewForm(request.status)) return { error: "This request isn't waiting for your review." };
  const admin = tryAdminClient();
  if (!admin) return { error: UNAVAILABLE };

  const res = await applicantTransition({
    admin, userId: user.id, request, to: "in_progress",
    latestUpdate: "You asked for changes to the filled form.",
    eventType: "user_changes_requested", message: parsed.data.message,
  });
  if (!res.error) revalidateRequests(request.id);
  return res;
}

/** "I completed my step." Never marks the application submitted: it returns
 *  the request to the admin, who records the official submission only after
 *  a reference number or confirmation document is provided/verified. Any
 *  reference the applicant types is stored in the history as REPORTED. */
export async function completeMyActionAction(formData: FormData): Promise<{ error?: string }> {
  const parsed = actionDoneSchema.safeParse({
    requestId: String(formData.get("requestId") ?? ""),
    message: String(formData.get("message") ?? ""),
    reportedReference: String(formData.get("reportedReference") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const loaded = await loadOwnedRequest(parsed.data.requestId);
  if (!loaded.ok) return { error: loaded.error };
  const { supabase, user, request } = loaded;
  if (!canUserCompleteAction(request.status)) return { error: "This request isn't waiting for your action." };
  const admin = tryAdminClient();
  if (!admin) return { error: UNAVAILABLE };

  const filesResult = await readValidatedFiles(formData, MAX_FILES_PER_REQUEST);
  if ("error" in filesResult) return { error: filesResult.error };

  const uploaded: UploadedItem[] = [];
  for (const { file, mime } of filesResult.files) {
    const path = `${user.id}/application-requests/${request.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
    if (upErr) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      return { error: "Couldn't upload a file. Please try again." };
    }
    uploaded.push({ path, name: file.name, size: file.size, mime, purpose: "Added when you completed your step" });
  }
  let docIds: string[] = [];
  const undoFiles = async () => {
    if (docIds.length) await admin.from("application_request_documents").delete().in("id", docIds);
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
  };
  if (uploaded.length) {
    const { data: rows, error: docErr } = await supabase.from("application_request_documents").insert(
      uploaded.map((u) => ({
        request_id: request.id, user_id: user.id, file_name: u.name.slice(0, 255), mime_type: u.mime,
        size_bytes: u.size, storage_path: u.path, purpose: u.purpose,
      })),
    ).select("id");
    if (docErr || !rows) {
      await supabase.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      return { error: "Couldn't save your files. Please try again." };
    }
    docIds = rows.map((d: { id: string }) => d.id);
  }

  const parts = [parsed.data.message, parsed.data.reportedReference ? `Reference number reported by you (not yet verified): ${parsed.data.reportedReference}` : null]
    .filter((p): p is string => !!p);
  const res = await applicantTransition({
    admin, userId: user.id, request, to: "in_progress",
    latestUpdate: "You said you completed your step. An admin will verify and record the official confirmation.",
    eventType: "user_action_completed", message: parts.length ? parts.join("\n") : null,
  });
  if (res.error) {
    await undoFiles();
    return res;
  }
  revalidateRequests(request.id);
  return {};
}
