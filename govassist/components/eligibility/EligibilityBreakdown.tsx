import { Card } from "@/components/ui/Card";
import { groupChecks } from "@/lib/eligibility/explain";
import type { EligibilityCheck } from "@/lib/eligibility/types";

type Tone = "pass" | "fail" | "missing" | "manual";

const MARK: Record<Tone, { symbol: string; cls: string }> = {
  pass: { symbol: "✓", cls: "text-eligible-fg" },
  fail: { symbol: "✕", cls: "text-ineligible-fg" },
  missing: { symbol: "?", cls: "text-caution-fg" },
  manual: { symbol: "!", cls: "text-caution-fg" },
};

function Group({ title, hint, tone, checks }: { title: string; hint?: string; tone: Tone; checks: EligibilityCheck[] }) {
  if (checks.length === 0) return null;
  const mark = MARK[tone];
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-2 text-sm">
            <span className={mark.cls} aria-hidden="true">{mark.symbol}</span>
            <span className="text-ink-muted">
              <span className="font-medium text-ink">{c.label}: </span>
              {c.explanation}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The "why" behind a classification: passed checks, failed checks, missing
 *  information, and conditions a person must verify. Pure display — every
 *  line comes from the deterministic engine's own explanations. */
export function EligibilityBreakdown({ checks, bare = false }: { checks: EligibilityCheck[]; bare?: boolean }) {
  const g = groupChecks(checks);
  const body = (
    <div className="space-y-4">
      <Group title="Checks you passed" tone="pass" checks={g.passed} />
      <Group title="Checks you did not meet" tone="fail" checks={g.failed} />
      <Group title="Missing information" hint="Add this to your profile, or wait for the official rules to be published." tone="missing" checks={g.missing} />
      <Group title="Conditions to verify yourself" hint="These can't be checked from your profile." tone="manual" checks={g.manualReview} />
      {checks.length === 0 && <p className="text-sm text-ink-muted">No published rules to check yet.</p>}
    </div>
  );
  return bare ? body : <Card className="p-4">{body}</Card>;
}
