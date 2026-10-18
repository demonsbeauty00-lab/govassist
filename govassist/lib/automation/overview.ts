import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { classifyCycleTiming, countCycles, daysUntil, todayIST } from "./cycles";
import { isStuckAutoPublish } from "./retry-rules";
import { countSources, shortError, sourceHealth, type SourceHealthInput } from "./sources";
import { countQueues } from "@/lib/application-requests/admin-queues";
import type {
  AuditItem, AutomationOverview, ClosingSoon, FailedDelivery, JobRunItem, Loaded, StuckUpdate,
} from "./overview-types";

type Admin = ReturnType<typeof createAdminClient>;

const WINDOW_DAYS = 30;
const ROW_CAP = 5000;

async function section<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch {
    return { ok: false, error: "Couldn't load this section." };
  }
}

/** Exact count; THROWS on a database error so a failed query is never shown as "0". */
async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await q;
  if (error) throw new Error("count failed");
  return n ?? 0;
}

function head(admin: Admin, table: "documents" | "paper_ingestion_runs" | "notification_deliveries" | "notifications" | "detected_updates" | "application_request_events" | "application_audit_log") {
  return admin.from(table).select("id", { count: "exact", head: true });
}

interface NotificationSourceRow extends SourceHealthInput {
  id: string; organization: string; official_url: string; parser_version: string;
}

export async function loadOverview(admin: Admin, now: Date = new Date()): Promise<AutomationOverview> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const today = todayIST(now);

  const [sources, updates, cycles, documents, notifications, requests, sessions, jobs, audit] = await Promise.all([
    section(async () => {
      const { data, error } = await admin
        .from("notification_sources")
        .select("id, organization, official_url, enabled, needs_parser_maintenance, last_checked_at, last_success_at, last_error, consecutive_failures, check_frequency_minutes, parser_version")
        .order("organization", { ascending: true })
        .limit(500);
      if (error) throw new Error("sources");
      const rows = (data ?? []) as unknown as NotificationSourceRow[];
      const { data: paperData, error: paperError } = await admin
        .from("paper_ingestion_sources")
        .select("enabled, needs_parser_maintenance, last_checked_at, last_success_at, last_error, check_frequency_minutes")
        .limit(500);
      if (paperError) throw new Error("paper sources");
      const paperRows = ((paperData ?? []) as unknown as Omit<SourceHealthInput, "consecutive_failures">[]).map((p) => ({ ...p, consecutive_failures: 0 }));
      const paperCounts = countSources(paperRows, now);
      return {
        counts: countSources(rows, now),
        items: rows.map((r) => ({
          id: r.id, organization: r.organization, url: r.official_url, health: sourceHealth(r, now), enabled: r.enabled,
          needsMaintenance: r.needs_parser_maintenance, lastCheckedAt: r.last_checked_at, lastSuccessAt: r.last_success_at,
          lastError: shortError(r.last_error), consecutiveFailures: r.consecutive_failures, parserVersion: r.parser_version,
        })),
        paper: { total: paperCounts.total, active: paperCounts.active, inactive: paperCounts.inactive, maintenance: paperCounts.maintenance, withErrors: paperCounts.withErrors },
      };
    }),

    section(async () => {
      const [detected, processed, published, rejected, needsReview] = await Promise.all([
        count(head(admin, "detected_updates").gte("detected_at", since)),
        count(head(admin, "detected_updates").gte("detected_at", since).not("processed_at", "is", null)),
        count(head(admin, "detected_updates").gte("detected_at", since).eq("status", "published")),
        count(head(admin, "detected_updates").gte("detected_at", since).eq("status", "rejected")),
        count(head(admin, "detected_updates").eq("status", "pending").eq("classification", "needs_review")),
      ]);
      const { data: oldest } = await admin
        .from("detected_updates").select("detected_at").eq("status", "pending").eq("classification", "needs_review")
        .order("detected_at", { ascending: true }).limit(1);
      const { data: pendingAuto, error } = await admin
        .from("detected_updates").select("id, title, detected_at, status, classification, source_id")
        .eq("status", "pending").eq("classification", "auto_publish").order("detected_at", { ascending: true }).limit(50);
      if (error) throw new Error("stuck");
      const stuckRows = ((pendingAuto ?? []) as unknown as { id: string; title: string; detected_at: string; status: string; classification: string; source_id: string }[])
        .filter((u) => isStuckAutoPublish(u, now)).slice(0, 20);
      const orgs = new Map<string, string>();
      if (stuckRows.length > 0) {
        const { data: srcs } = await admin.from("notification_sources").select("id, organization").in("id", stuckRows.map((u) => u.source_id));
        for (const s of (srcs ?? []) as unknown as { id: string; organization: string }[]) orgs.set(s.id, s.organization);
      }
      const stuck: StuckUpdate[] = stuckRows.map((u) => ({ id: u.id, title: u.title, detectedAt: u.detected_at, organization: orgs.get(u.source_id) ?? null }));
      return {
        windowDays: WINDOW_DAYS, detected, processed, published, rejected, needsReview,
        oldestNeedsReviewAt: ((oldest ?? []) as unknown as { detected_at: string }[])[0]?.detected_at ?? null,
        stuckAutoPublish: stuck,
      };
    }),

    section(async () => {
      const { data, error } = await admin
        .from("exam_cycles").select("id, exam_id, cycle_label, application_start_date, application_end_date")
        .eq("status", "published").limit(ROW_CAP);
      if (error) throw new Error("cycles");
      const rows = (data ?? []) as unknown as { id: string; exam_id: string; cycle_label: string; application_start_date: string | null; application_end_date: string | null }[];
      const soon = rows
        .filter((c) => classifyCycleTiming(c, today) === "current" && c.application_end_date !== null && daysUntil(c.application_end_date, today) <= 7)
        .sort((a, b) => (a.application_end_date ?? "").localeCompare(b.application_end_date ?? ""))
        .slice(0, 10);
      const names = new Map<string, string>();
      if (soon.length > 0) {
        const { data: exams } = await admin.from("exams").select("id, short_name").in("id", soon.map((c) => c.exam_id));
        for (const e of (exams ?? []) as unknown as { id: string; short_name: string }[]) names.set(e.id, e.short_name);
      }
      const closingSoon: ClosingSoon[] = soon.map((c) => ({
        id: c.id, label: `${names.get(c.exam_id) ?? "Exam"} — ${c.cycle_label}`, endDate: c.application_end_date ?? "", daysLeft: daysUntil(c.application_end_date ?? today, today),
      }));
      return { counts: countCycles(rows, today), closingSoon };
    }),

    section(async () => {
      const [processing, needsReview, verified, iPending, iProcessing, iOk, iReview, iFailed, iRejected] = await Promise.all([
        count(head(admin, "documents").eq("status", "processing")),
        count(head(admin, "documents").eq("status", "needs_review")),
        count(head(admin, "documents").eq("status", "verified")),
        count(head(admin, "paper_ingestion_runs").eq("status", "pending")),
        count(head(admin, "paper_ingestion_runs").eq("status", "processing")),
        count(head(admin, "paper_ingestion_runs").eq("status", "auto_published")),
        count(head(admin, "paper_ingestion_runs").eq("status", "needs_review")),
        count(head(admin, "paper_ingestion_runs").eq("status", "failed")),
        count(head(admin, "paper_ingestion_runs").eq("status", "rejected")),
      ]);
      return {
        user: { processing, needsReview, verified },
        ingestion: { processing: iPending + iProcessing, successful: iOk, needsReview: iReview, failed: iFailed, rejected: iRejected },
      };
    }),

    section(async () => {
      const { data: logRows, error } = await admin
        .from("notification_job_log").select("created, duplicates, disabled, failed").gte("created_at", since).limit(ROW_CAP);
      if (error) throw new Error("log");
      const rows = (logRows ?? []) as unknown as { created: number; duplicates: number; disabled: number; failed: number }[];
      const { data: first } = await admin.from("notification_job_log").select("created_at").order("created_at", { ascending: true }).limit(1);
      const [pending, sent, delivered, failed, skipped, inApp] = await Promise.all([
        count(head(admin, "notification_deliveries").eq("status", "pending")),
        count(head(admin, "notification_deliveries").eq("status", "sent")),
        count(head(admin, "notification_deliveries").eq("status", "delivered")),
        count(head(admin, "notification_deliveries").eq("status", "failed")),
        count(head(admin, "notification_deliveries").eq("status", "skipped")),
        count(head(admin, "notifications").gte("created_at", since)),
      ]);
      const { data: failedRows } = await admin
        .from("notification_deliveries").select("id, channel, attempts, last_error, updated_at")
        .eq("status", "failed").order("updated_at", { ascending: false }).limit(15);
      const failedDeliveries: FailedDelivery[] = ((failedRows ?? []) as unknown as { id: string; channel: string; attempts: number; last_error: string | null; updated_at: string }[])
        .map((d) => ({ id: d.id, channel: d.channel, attempts: d.attempts, lastError: shortError(d.last_error, 120), updatedAt: d.updated_at }));
      const sum = (k: "created" | "duplicates" | "disabled" | "failed") => rows.reduce((n, r) => n + (r[k] ?? 0), 0);
      return {
        windowDays: WINDOW_DAYS, batches: rows.length, created: sum("created"), duplicatesPrevented: sum("duplicates"),
        disabledByPreference: sum("disabled"), failed: sum("failed"),
        loggedSince: ((first ?? []) as unknown as { created_at: string }[])[0]?.created_at ?? null,
        inAppCreated: inApp,
        deliveries: { pending, sent, delivered, failed, skipped },
        failedDeliveries,
      };
    }),

    section(async () => {
      const { data, error } = await admin.from("application_requests").select("status, application_deadline").limit(ROW_CAP);
      if (error) throw new Error("requests");
      const q = countQueues((data ?? []) as unknown as { status: string; application_deadline: string | null }[], today);
      const failures = await count(head(admin, "application_request_events").eq("event_type", "notification_failed").gte("created_at", since));
      return { open: q.open, overdue: q.overdue, byStatus: q.byStatus, notificationFailures: failures };
    }),

    section(async () => {
      const { data, error } = await admin.from("application_sessions").select("status").limit(ROW_CAP);
      if (error) throw new Error("sessions");
      const rows = (data ?? []) as unknown as { status: string }[];
      const n = (...s: string[]) => rows.filter((r) => s.includes(r.status)).length;
      const blocked = await count(head(admin, "application_audit_log").eq("event_type", "submission_blocked").gte("created_at", since));
      return { active: n("in_progress", "ready_for_review"), paused: n("paused"), needsUserAction: n("awaiting_user_action"), blockedSubmissions: blocked };
    }),

    section(async () => {
      const latest = async (job: "check_sources" | "check_pyq_sources"): Promise<JobRunItem | null> => {
        const { data, error } = await admin.from("automation_job_runs").select("started_at, finished_at, ok, summary").eq("job", job).order("started_at", { ascending: false }).limit(1);
        if (error) throw new Error("jobs");
        const r = ((data ?? []) as unknown as { started_at: string; finished_at: string | null; ok: boolean | null; summary: Record<string, unknown> }[])[0];
        return r ? { startedAt: r.started_at, finishedAt: r.finished_at, ok: r.ok, summary: r.summary ?? {} } : null;
      };
      return { checkSources: await latest("check_sources"), checkPyqSources: await latest("check_pyq_sources") };
    }),

    section(async () => {
      const { data, error } = await admin.from("admin_audit_log").select("id, created_at, admin_id, action, outcome, target_type, target_id, details").order("created_at", { ascending: false }).limit(25);
      if (error) throw new Error("audit");
      return ((data ?? []) as unknown as { id: string; created_at: string; admin_id: string | null; action: string; outcome: string; target_type: string; target_id: string | null; details: Record<string, unknown> | null }[])
        .map((r): AuditItem => ({
          id: r.id, createdAt: r.created_at, action: r.action, outcome: r.outcome, targetType: r.target_type, targetId: r.target_id,
          adminRef: r.admin_id ? r.admin_id.slice(0, 8) : null,
          note: typeof r.details?.reason === "string" ? r.details.reason : typeof r.details?.error === "string" ? r.details.error : null,
        }));
    }),
  ]);

  return { generatedAt: now.toISOString(), sources, updates, cycles, documents, notifications, requests, sessions, jobs, audit };
}
