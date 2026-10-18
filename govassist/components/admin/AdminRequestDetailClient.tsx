"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RequestStatusBadge } from "@/components/application-requests/StatusBadge";
import { OpenDocumentButton } from "@/components/application-requests/OpenDocumentButton";
import {
  addInternalNoteAction, claimRequestAction, getAdminDocumentUrlAction, linkRequestCycleAction, releaseRequestAction,
  sendAdminMessageAction, setOfficialStageAction, startFormFillingAction, updateRequestStatusAction,
  uploadConfirmationDocumentAction, type AdminActionResult, type AdminRequestDetail,
} from "@/lib/actions/application-requests-admin";
import { ASSISTANCE_LABEL, OFFICIAL_STAGE_LABEL, STATUS_LABEL, TERMINAL_STATUSES } from "@/lib/application-requests/constants";
import { allowedAdminTargets } from "@/lib/application-requests/transitions";
import { canAdvanceOfficialStage, isOfficiallySubmitted } from "@/lib/application-requests/official-stage";
import { MANUAL_OFFICIAL_STAGES, todayIST } from "@/lib/application-requests/schema";
import { timelineLabel } from "@/lib/application-requests/timeline";
import { isOverdueRequest } from "@/lib/application-requests/admin-queues";

const inputCls = "w-full rounded border border-hairline bg-paper-raised px-3.5 py-2.5 text-[15px] text-ink focus-visible:border-brand-600";

export function AdminRequestDetailClient({ detail }: { detail: AdminRequestDetail }) {
  const router = useRouter();
  const { request, events, documents, assignment } = detail;
  const targets = allowedAdminTargets(request.status, request.assistance_type);
  const closed = TERMINAL_STATUSES.includes(request.status);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toStatus, setToStatus] = useState(targets[0] ?? "");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState(request.official_reference_number ?? "");
  const [note, setNote] = useState("");
  const [chat, setChat] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState("");
  const [stage, setStage] = useState<(typeof MANUAL_OFFICIAL_STAGES)[number]>(
    MANUAL_OFFICIAL_STAGES.find((st) => canAdvanceOfficialStage(request.official_stage, st)) ?? "admit_card",
  );
  const [stageMsg, setStageMsg] = useState("");

  function run(fn: () => Promise<AdminActionResult>, ok: string, after?: () => void) {
    setError(null);
    setNotice(null);
    setWarning(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) { setError(res.error); return; }
      setNotice(ok);
      if (res.warning) setWarning(res.warning);
      after?.();
      router.refresh();
    });
  }

  const showRef = toStatus === "in_progress" || toStatus === "awaiting_user_action" || toStatus === "submitted_on_portal" || toStatus === "completed";

  return (
    <div className="mt-3 space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-faint">{request.request_code}</p>
            <p className="text-lg font-semibold text-ink">{request.exam_title}</p>
            <p className="text-sm text-ink-muted">{ASSISTANCE_LABEL[request.assistance_type]}</p>
          </div>
          <RequestStatusBadge status={request.status} />
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-faint">Applicant</dt><dd className="text-ink">{request.applicant_name}</dd></div>
          <div><dt className="text-ink-faint">Mobile</dt><dd className="text-ink">{request.applicant_phone}</dd></div>
          <div><dt className="text-ink-faint">Submitted</dt><dd className="text-ink">{new Date(request.created_at).toLocaleString()}</dd></div>
          <div><dt className="text-ink-faint">Deadline (entered by applicant — verify)</dt><dd className="text-ink">{request.application_deadline ?? "Not provided"}{isOverdueRequest(request, todayIST()) && <span className="ml-2 font-medium text-ineligible-fg">Overdue – the last date has passed; check the official notice</span>}</dd></div>
          {request.post_applied && <div><dt className="text-ink-faint">Post</dt><dd className="text-ink">{request.post_applied}</dd></div>}
          {request.notification_url && (
            <div className="sm:col-span-2"><dt className="text-ink-faint">Notification link (entered by applicant — verify it)</dt>
              <dd><a className="break-all text-brand-700 underline" href={request.notification_url} target="_blank" rel="noopener noreferrer">{request.notification_url}</a></dd></div>
          )}
          {request.details && <div className="sm:col-span-2"><dt className="text-ink-faint">Applicant notes</dt><dd className="whitespace-pre-wrap text-ink">{request.details}</dd></div>}
          <div><dt className="text-ink-faint">Consent</dt><dd className="text-ink">{new Date(request.consent_accepted_at).toLocaleDateString()} ({request.consent_version})</dd></div>
          {request.official_reference_number && <div><dt className="text-ink-faint">Official reference number</dt><dd className="break-all text-ink">{request.official_reference_number}</dd></div>}
        </dl>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="text-base font-semibold text-ink">Assignment</h2>
        <p className="text-sm text-ink-muted">
          {assignment ? (assignment.mine ? "Assigned to you." : "Assigned to another admin.") : "Not assigned yet."}
          {" "}Official stage: <strong>{OFFICIAL_STAGE_LABEL[request.official_stage]}</strong>
          {request.cycle_label ? ` · Cycle: ${request.cycle_label}` : " · Not linked to an exam cycle"}
        </p>
        <div className="flex flex-wrap gap-2">
          {!assignment && <Button size="sm" isLoading={pending} disabled={pending} onClick={() => run(() => claimRequestAction(request.id), "Claimed ✓")}>Claim</Button>}
          {assignment && !assignment.mine && (
            <Button size="sm" variant="secondary" isLoading={pending} disabled={pending}
              onClick={() => { if (window.confirm("Take this request over from the other admin?")) run(() => claimRequestAction(request.id, true), "Taken over ✓"); }}>Take over</Button>
          )}
          {assignment?.mine && <Button size="sm" variant="secondary" isLoading={pending} disabled={pending} onClick={() => run(() => releaseRequestAction(request.id), "Released ✓")}>Release</Button>}
          {request.status === "in_progress" && request.assistance_type === "full_application" && (
            <Button size="sm" variant="secondary" isLoading={pending} disabled={pending} onClick={() => run(() => startFormFillingAction(request.id), "Marked as started ✓")}>Mark form filling started</Button>
          )}
        </div>
        {!closed && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => linkRequestCycleAction(request.id, cycleId.trim()), "Cycle linked ✓", () => setCycleId("")); }}>
            <div className="min-w-0 flex-1">
              <label htmlFor="cycle" className="block text-sm font-medium text-ink">Link to exam cycle (ID of a published cycle)</label>
              <input id="cycle" value={cycleId} onChange={(e) => setCycleId(e.target.value)} className={inputCls} />
            </div>
            <Button type="submit" size="sm" variant="secondary" isLoading={pending} disabled={pending || !cycleId.trim()}>Link</Button>
          </form>
        )}
        {request.official_application_url && (
          <p className="text-sm"><span className="text-ink-faint">Official application link (entered by applicant — verify): </span>
            <a className="break-all text-brand-700 underline" href={request.official_application_url} target="_blank" rel="noopener noreferrer">{request.official_application_url}</a></p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-base font-semibold text-ink">Documents</h2>
        {documents.length === 0 ? <p className="mt-2 text-sm text-ink-muted">No documents attached.</p> : (
          <ul className="mt-2 divide-y divide-hairline">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm text-ink">{d.kind === "confirmation" ? "Confirmation: " : ""}{d.file_name}</span>
                <OpenDocumentButton documentId={d.id} label="View" getUrl={getAdminDocumentUrlAction} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-faint">Links expire in 2 minutes. Each view is logged (who and when — never the content).</p>
        {["in_progress", "awaiting_user_action", "submitted_on_portal", "completed"].includes(request.status) && (
          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("requestId", request.id);
            run(() => uploadConfirmationDocumentAction(fd), "Confirmation document added ✓", () => form.reset());
          }}>
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required aria-label="Confirmation document" className="text-sm" />
            <Button type="submit" size="sm" variant="secondary" isLoading={pending} disabled={pending}>Upload confirmation</Button>
          </form>
        )}
      </Card>

      {!closed && targets.length > 0 && (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ink">Change status</h2>
          <label htmlFor="to" className="block text-sm font-medium text-ink">New status</label>
          <select id="to" value={toStatus} onChange={(e) => setToStatus(e.target.value as typeof toStatus)}
            className="h-11 w-full rounded border border-hairline bg-paper-raised px-3 text-[15px] text-ink">
            {targets.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <label htmlFor="msg" className="block text-sm font-medium text-ink">
            Message to applicant {toStatus === "waiting_for_user" ? "(required — what is missing?)" : toStatus === "rejected" ? "(required — reason)" : toStatus === "form_filled" ? "(required — what to review and do next)" : toStatus === "awaiting_user_action" ? "(required — exactly what they must do)" : "(optional)"}
          </label>
          <textarea id="msg" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className={inputCls} />
          {showRef && (
            <>
              <label htmlFor="ref" className="block text-sm font-medium text-ink">Official reference number</label>
              <input id="ref" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
              {toStatus === "submitted_on_portal" && (
                <p className="text-xs text-ink-muted">
                  Requires a reference number or an uploaded confirmation document. Only mark this once YOU have verified the
                  official application was submitted. &quot;Form filled&quot; is never the same as submitted.
                </p>
              )}
            </>
          )}
          <Button isLoading={pending} disabled={pending || !toStatus}
            onClick={() => run(
              () => updateRequestStatusAction({
                requestId: request.id, toStatus, message: message || undefined,
                officialReferenceNumber: showRef && reference && reference !== request.official_reference_number ? reference : undefined,
              }),
              "Status updated ✓", () => setMessage(""),
            )}>
            {pending ? "Saving…" : "Update status"}
          </Button>
        </Card>
      )}

      {isOfficiallySubmitted(request.status) && (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ink">Record an official exam stage</h2>
          <p className="text-xs text-ink-muted">Only for an official public notice that monitoring has not picked up. Moves forward only.</p>
          <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} className="h-11 w-full rounded border border-hairline bg-paper-raised px-3 text-[15px] text-ink">
            {MANUAL_OFFICIAL_STAGES.filter((st) => canAdvanceOfficialStage(request.official_stage, st)).map((st) => <option key={st} value={st}>{OFFICIAL_STAGE_LABEL[st]}</option>)}
          </select>
          <textarea aria-label="Note" rows={2} maxLength={2000} value={stageMsg} onChange={(e) => setStageMsg(e.target.value)} className={inputCls} placeholder="Optional note (source of the notice)" />
          <Button size="sm" isLoading={pending} disabled={pending}
            onClick={() => run(() => setOfficialStageAction({ requestId: request.id, stage, message: stageMsg || undefined }), "Stage recorded ✓", () => setStageMsg(""))}>
            Record stage
          </Button>
        </Card>
      )}

      {!closed && (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ink">Message the applicant (no status change)</h2>
          <label htmlFor="chat" className="sr-only">Message</label>
          <textarea id="chat" rows={3} maxLength={2000} value={chat} onChange={(e) => setChat(e.target.value)} className={inputCls} />
          <Button size="sm" isLoading={pending} disabled={pending || !chat.trim()}
            onClick={() => run(() => sendAdminMessageAction(request.id, chat), "Message sent ✓", () => setChat(""))}>
            Send message
          </Button>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold text-ink">Internal note (never shown to the applicant)</h2>
        <p className="text-xs text-ink-faint">Non-sensitive processing notes only. Never record passwords, OTPs or document contents.</p>
        <label htmlFor="note" className="sr-only">Internal note</label>
        <textarea id="note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        <Button size="sm" variant="secondary" isLoading={pending} disabled={pending || !note.trim()}
          onClick={() => run(() => addInternalNoteAction(request.id, note), "Note saved ✓", () => setNote(""))}>
          Save note
        </Button>
      </Card>

      {error && <p className="text-sm text-ineligible-fg" role="alert">{error}</p>}
      {notice && <p className="text-sm text-eligible-fg" role="status">{notice}</p>}
      {warning && <p className="rounded border border-hairline bg-paper-sunk p-3 text-sm text-ink" role="alert">⚠ {warning}</p>}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Audit history</h2>
        <Card className="divide-y divide-hairline">
          {events.map((ev) => (
            <div key={ev.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {timelineLabel(ev)}{ev.visibility === "internal" ? " (internal)" : ""}
                  {ev.from_status && ev.to_status ? ` · ${STATUS_LABEL[ev.from_status as keyof typeof STATUS_LABEL] ?? ev.from_status} → ${STATUS_LABEL[ev.to_status as keyof typeof STATUS_LABEL] ?? ev.to_status}` : ""}
                </span>
                <span className="text-xs text-ink-faint">{ev.actor_role} · {new Date(ev.created_at).toLocaleString()}</span>
              </div>
              {ev.message && <p className="mt-1 text-ink-muted">{ev.message}</p>}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
