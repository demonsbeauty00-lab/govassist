"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RequestStatusBadge } from "./StatusBadge";
import { OpenDocumentButton } from "./OpenDocumentButton";
import { ContactAdminCard } from "./ContactAdminCard";
import {
  approveFilledFormAction, cancelMyRequestAction, completeMyActionAction, deleteMyRequestDocumentsAction,
  getMyDocumentUrlAction, replyToRequestAction, requestFormChangesAction, type RequestDetail,
} from "@/lib/actions/application-requests";
import { ASSISTANCE_LABEL, OFFICIAL_STAGE_LABEL, TERMINAL_STATUSES } from "@/lib/application-requests/constants";
import {
  canUserCancel, canUserCompleteAction, canUserReply, canUserReviewForm,
} from "@/lib/application-requests/transitions";
import { isOfficialEvent, timelineLabel } from "@/lib/application-requests/timeline";

export function RequestDetailClient({ detail }: { detail: RequestDetail }) {
  const router = useRouter();
  const { request, events, documents } = detail;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const replyRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLFormElement>(null);
  const [changes, setChanges] = useState("");

  const closed = TERMINAL_STATUSES.includes(request.status);

  function run(fn: () => Promise<{ error?: string }>, okMessage: string, after?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      setNotice(okMessage);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-5">
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
          <div><dt className="text-ink-faint">Submitted</dt><dd className="text-ink">{new Date(request.created_at).toLocaleString()}</dd></div>
          {request.application_deadline && (
            <div><dt className="text-ink-faint">Last date (as you entered it)</dt><dd className="text-ink">{request.application_deadline}</dd></div>
          )}
          {request.post_applied && <div><dt className="text-ink-faint">Post</dt><dd className="text-ink">{request.post_applied}</dd></div>}
          {request.cycle_label && <div><dt className="text-ink-faint">Recruitment cycle</dt><dd className="text-ink">{request.cycle_label}</dd></div>}
          {request.official_application_url && (
            <div className="sm:col-span-2"><dt className="text-ink-faint">Official application link</dt>
              <dd><a className="break-all text-brand-700 underline" href={request.official_application_url} target="_blank" rel="noopener noreferrer">{request.official_application_url}</a></dd></div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-ink-faint">Official application status (separate from this request)</dt>
            <dd className="text-ink">{OFFICIAL_STAGE_LABEL[request.official_stage]}</dd>
          </div>
          {request.official_reference_number && (
            <div><dt className="text-ink-faint">Official reference number</dt><dd className="break-all text-ink">{request.official_reference_number}</dd></div>
          )}
        </dl>
        {request.latest_update && <p className="mt-3 text-sm text-ink-muted">Latest update: {request.latest_update}</p>}
        {request.admin_message && (
          <p className="mt-2 rounded bg-paper-sunk p-3 text-sm text-ink">Admin message: {request.admin_message}</p>
        )}
        {request.status === "completed" && (
          <p className="mt-2 text-sm text-eligible-fg">An admin confirmed this request was completed.</p>
        )}
        {request.status === "submitted_on_portal" && (
          <p className="mt-2 text-sm text-eligible-fg">Submission on the official portal was confirmed by an admin.</p>
        )}
      </Card>

      {!closed && <ContactAdminCard requestCode={request.request_code} examTitle={request.exam_title} />}

      {canUserReviewForm(request.status) && (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ink">Your form is filled — please review it</h2>
          <p className="text-sm text-ink-muted">
            This is <strong>not</strong> submitted yet. Check every detail against your documents, using the instructions the admin sent.
            After you approve, you complete the declaration, any payment, OTP/CAPTCHA and the final submit yourself on the official portal.
          </p>
          {request.user_action_note && <p className="rounded bg-paper-sunk p-3 text-sm text-ink">{request.user_action_note}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" isLoading={pending} disabled={pending}
              onClick={() => run(() => approveFilledFormAction(request.id), "Thanks — now complete the remaining steps on the official portal.")}>
              Looks correct — I&apos;ll continue
            </Button>
          </div>
          <label htmlFor="changes" className="block text-sm font-medium text-ink">Something wrong? Tell the admin what to change</label>
          <textarea id="changes" rows={3} maxLength={2000} value={changes} onChange={(e) => setChanges(e.target.value)}
            className="w-full rounded border border-hairline bg-paper-raised px-3.5 py-2.5 text-[15px] text-ink focus-visible:border-brand-600" />
          <p className="text-xs text-ink-faint">Never write passwords, OTPs or payment details.</p>
          <Button size="sm" variant="secondary" isLoading={pending} disabled={pending || !changes.trim()}
            onClick={() => run(() => requestFormChangesAction(request.id, changes), "Change request sent ✓", () => setChanges(""))}>
            Ask for changes
          </Button>
        </Card>
      )}

      {canUserCompleteAction(request.status) && (
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold text-ink">Action needed from you</h2>
          <p className="text-sm text-ink-muted">
            Do the remaining steps yourself on the official portal (declaration, fee payment, OTP/CAPTCHA, final submit). GovAssist never
            handles these for you and never asks for your password, OTP or payment details.
          </p>
          {request.user_action_note && <p className="rounded bg-paper-sunk p-3 text-sm text-ink">{request.user_action_note}</p>}
          <form ref={doneRef} className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("requestId", request.id);
            run(() => completeMyActionAction(fd), "Thanks — an admin will verify and confirm.", () => doneRef.current?.reset());
          }}>
            <label htmlFor="ref" className="block text-sm font-medium text-ink">Application number shown on the portal (optional)</label>
            <input id="ref" name="reportedReference" maxLength={100}
              className="h-11 w-full rounded border border-hairline bg-paper-raised px-3.5 text-[15px] text-ink focus-visible:border-brand-600" />
            <label htmlFor="done-msg" className="block text-sm font-medium text-ink">Note for the admin (optional)</label>
            <textarea id="done-msg" name="message" rows={2} maxLength={2000}
              className="w-full rounded border border-hairline bg-paper-raised px-3.5 py-2.5 text-[15px] text-ink focus-visible:border-brand-600" />
            <input name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png" aria-label="Attach confirmation screenshot or PDF" className="block w-full text-sm" />
            <Button type="submit" size="sm" isLoading={pending} disabled={pending}>{pending ? "Sending…" : "I completed my step"}</Button>
          </form>
          <p className="text-xs text-ink-faint">Your request is only marked as submitted after an admin verifies the confirmation.</p>
        </Card>
      )}

      {canUserReply(request.status) && (
        <Card className="p-4">
          <h2 className="text-base font-semibold text-ink">The admin needs more information</h2>
          <form ref={replyRef} className="mt-3 space-y-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("requestId", request.id);
            run(() => replyToRequestAction(fd), "Reply sent ✓", () => replyRef.current?.reset());
          }}>
            <label htmlFor="reply" className="sr-only">Your reply</label>
            <textarea id="reply" name="message" rows={4} maxLength={2000} required
              className="w-full rounded border border-hairline bg-paper-raised px-3.5 py-2.5 text-[15px] text-ink focus-visible:border-brand-600" />
            <input name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png" aria-label="Attach files" className="block w-full text-sm" />
            <Button type="submit" size="sm" isLoading={pending} disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button>
          </form>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-base font-semibold text-ink">Your documents</h2>
        {documents.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No documents on this request.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm text-ink">
                  {d.kind === "confirmation" ? "Confirmation: " : ""}{d.file_name}
                </span>
                <OpenDocumentButton documentId={d.id} label="Open" getUrl={getMyDocumentUrlAction} />
              </li>
            ))}
          </ul>
        )}
        {closed && documents.some((d) => d.uploaded_by === "user") && (
          <Button className="mt-3" size="sm" variant="danger" isLoading={pending} disabled={pending}
            onClick={() => { if (window.confirm("Permanently delete your uploaded documents from this request?")) run(() => deleteMyRequestDocumentsAction(request.id), "Documents deleted ✓"); }}>
            Delete my documents
          </Button>
        )}
      </Card>

      {canUserCancel(request.status) && (
        <Button variant="danger" size="sm" isLoading={pending} disabled={pending}
          onClick={() => { if (window.confirm("Cancel this request?")) run(() => cancelMyRequestAction(request.id), "Request cancelled."); }}>
          Cancel request
        </Button>
      )}

      {error && <p className="text-sm text-ineligible-fg" role="alert">{error}</p>}
      {notice && <p className="text-sm text-eligible-fg" role="status">{notice}</p>}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Timeline</h2>
        <Card className="divide-y divide-hairline">
          {events.length === 0 ? <p className="p-3 text-sm text-ink-muted">No activity yet.</p> : events.map((ev) => (
            <div key={ev.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {timelineLabel(ev)}
                  {isOfficialEvent(ev) && <span className="ml-2 rounded bg-paper-sunk px-1.5 py-0.5 text-xs font-normal text-ink-muted">Official notice</span>}
                </span>
                <span className="text-xs text-ink-faint">{new Date(ev.created_at).toLocaleString()}</span>
              </div>
              {ev.message && <p className="mt-1 text-ink-muted">{ev.message}</p>}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
