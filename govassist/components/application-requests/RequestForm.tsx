"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createApplicationRequestAction } from "@/lib/actions/application-requests";
import {
  ASSISTANCE_LABEL, ASSISTANCE_TYPES, CONSENT_TEXT, DOCUMENT_REASON, MAX_FILES_PER_REQUEST, MAX_FILE_BYTES, SERVICE_TERMS,
} from "@/lib/application-requests/constants";

interface ExamOption { id: string; shortName: string }

interface CycleOption { id: string; label: string; endDate: string | null }
interface VaultDoc { id: string; name: string }

export function RequestForm({
  exams, cycles, vaultDocs, defaultName,
}: { exams: ExamOption[]; cycles: CycleOption[]; vaultDocs: VaultDoc[]; defaultName: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [examChoice, setExamChoice] = useState("");
  const [success, setSuccess] = useState(false);

  const [cycleChoice, setCycleChoice] = useState("");
  const [vaultPicked, setVaultPicked] = useState<string[]>([]);
  const custom = examChoice === "__custom";
  const cycleLinked = cycleChoice !== "";
  const pickedCycle = cycles.find((c) => c.id === cycleChoice);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // blocks accidental double-submit
    setError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    if (custom || cycleLinked) fd.set("examSlug", "");
    fd.delete("vaultDocumentIds");
    for (const id of vaultPicked) fd.append("vaultDocumentIds", id);
    startTransition(async () => {
      const res = await createApplicationRequestAction(fd);
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      if (res.error && !res.requestId) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      if (res.requestId) router.push(`/apply-assistant/${res.requestId}`);
    });
  }

  if (success) {
    return <p className="mt-6 text-sm text-eligible-fg" role="status">Request submitted ✓ Opening it…</p>;
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
      <Card className="space-y-4 p-4">
        <h2 className="text-base font-semibold text-ink">Which exam or job?</h2>
        {cycles.length > 0 && (
          <Select
            label="Recruitment cycle (recommended)"
            name="examCycleId"
            placeholder="Not listed / I'll enter it myself"
            value={cycleChoice}
            onChange={(e) => setCycleChoice(e.target.value)}
            error={fieldErrors.examCycleId}
            options={cycles.map((c) => ({ label: c.label, value: c.id }))}
          />
        )}
        {cycles.length > 0 && (
          <p className="text-xs text-ink-faint">Picking the exact cycle lets GovAssist show verified official updates (last date, admit card, answer key, result) on your request.</p>
        )}
        {pickedCycle?.endDate && (
          <p className="text-xs text-ink-muted">Official last date on file for this cycle: {pickedCycle.endDate}. Confirm it on the official notice.</p>
        )}
        {!cycleLinked && (
        <Select
          label="Exam / job"
          name="examSlug"
          placeholder="Choose an exam"
          value={examChoice}
          onChange={(e) => setExamChoice(e.target.value)}
          error={fieldErrors.examSlug}
          options={[...exams.map((e) => ({ label: e.shortName, value: e.id })), { label: "Other (enter it myself)", value: "__custom" }]}
        />
        )}
        {!cycleLinked && <Input label="Recruitment cycle / year (optional)" name="cycleLabel" maxLength={120} hint="For example: 2026 Tier 1" />}
        {custom && !cycleLinked && <Input label="Exam / notification name" name="customExamTitle" maxLength={200} error={fieldErrors.customExamTitle} />}
        <p className="text-xs text-ink-faint">
          The exam list above is sample data and may not match the real notification. If yours isn&apos;t listed, choose
          &quot;Other&quot;, and always add the official notification link and last date below so an admin can verify them.
        </p>
        <Input label="Official application link (optional)" name="officialApplicationUrl" type="url" inputMode="url" maxLength={500} error={fieldErrors.officialApplicationUrl} hint="The official portal page where the form is filled." />
        <Input label="Official notification link (optional)" name="notificationUrl" type="url" inputMode="url" maxLength={500} error={fieldErrors.notificationUrl} />
        <Input label="Last date to apply (optional)" name="applicationDeadline" type="date" error={fieldErrors.applicationDeadline} />
        <Input label="Post you want to apply for (optional)" name="postApplied" maxLength={200} />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-base font-semibold text-ink">What help do you need?</h2>
        <Select
          label="Assistance requested"
          name="assistanceType"
          placeholder="Choose one"
          error={fieldErrors.assistanceType}
          options={ASSISTANCE_TYPES.map((t) => ({ label: ASSISTANCE_LABEL[t], value: t }))}
        />
        <Input label="Your full name (as on documents)" name="applicantName" defaultValue={defaultName} maxLength={120} error={fieldErrors.applicantName} />
        <Input label="Mobile number" name="applicantPhone" type="tel" inputMode="numeric" maxLength={10} hint="So an admin can reach you if needed." error={fieldErrors.applicantPhone} />
        <div className="space-y-1.5">
          <label htmlFor="details" className="block text-sm font-medium text-ink">Anything the admin should know (optional)</label>
          <textarea id="details" name="details" rows={4} maxLength={2000}
            className="w-full rounded border border-hairline bg-paper-raised px-3.5 py-2.5 text-[15px] text-ink focus-visible:border-brand-600" />
          <p className="text-sm text-ink-faint">Never write passwords, OTPs or payment details here.</p>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold text-ink">Supporting documents (optional)</h2>
        <p className="text-sm text-ink-muted">{DOCUMENT_REASON}</p>
        {vaultDocs.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-ink">Reuse documents you already saved</legend>
            {vaultDocs.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="h-4 w-4" checked={vaultPicked.includes(d.id)}
                  onChange={(e) => setVaultPicked((cur) => e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id))} />
                <span className="min-w-0 truncate">{d.name}</span>
              </label>
            ))}
            <p className="text-xs text-ink-faint">A copy is attached to this request only; your saved document stays as it is.</p>
            {fieldErrors.vaultDocumentIds && <p className="text-sm text-ineligible-fg" role="alert">{fieldErrors.vaultDocumentIds}</p>}
          </fieldset>
        )}
        <input name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png"
          aria-label="Supporting documents" className="block w-full text-sm text-ink" />
        <p className="text-xs text-ink-faint">
          PDF, JPG or PNG · up to {MAX_FILES_PER_REQUEST} files in total · {MAX_FILE_BYTES / (1024 * 1024)}MB each. Stored privately; only you and
          authorised admins can open them.
        </p>
        {fieldErrors.files && <p className="text-sm text-ineligible-fg" role="alert">{fieldErrors.files}</p>}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-base font-semibold text-ink">Service terms, privacy & consent</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          {SERVICE_TERMS.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="text-sm text-ink-muted">{CONSENT_TEXT}</p>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4" />
          <span>I have read and I agree.</span>
        </label>
        {fieldErrors.consent && <p className="text-sm text-ineligible-fg" role="alert">{fieldErrors.consent}</p>}
      </Card>

      {error && <p className="text-sm text-ineligible-fg" role="alert">{error}</p>}
      <Button type="submit" fullWidth isLoading={pending} disabled={pending}>
        {pending ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
