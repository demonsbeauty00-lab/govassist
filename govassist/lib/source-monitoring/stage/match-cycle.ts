// ---------------------------------------------------------------------------
// Which exam cycle does an official update belong to? Pure.
//
// Deliberately conservative: an update is attached to a cycle only when the
// evidence points at exactly one. Zero or several candidates -> no match, and
// the pipeline sends the update to review instead of guessing. A year in the
// title that no cycle carries also blocks a match (e.g. a 2024 result must
// not attach to the only 2025 cycle just because it is the only one).
// ---------------------------------------------------------------------------

export interface ExamCandidate { id: string; name: string; shortName: string }
export interface CycleCandidate { id: string; examId: string; cycleLabel: string }

export type CycleMatchVia = "cycle_label" | "exam_name" | "single_candidate";

export interface CycleMatchResult {
  cycleId: string | null;
  examId: string | null;
  via: CycleMatchVia | null;
  /** Human-readable, for the audit log and admin review. */
  reason: string;
}

function norm(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function titleYears(title: string): string[] {
  return Array.from(new Set(Array.from(title.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)).map((m) => m[1] as string)));
}

const none = (reason: string, examId: string | null = null): CycleMatchResult => ({ cycleId: null, examId, via: null, reason });

export function matchCycle(input: {
  title: string;
  sourceExamId: string | null;
  exams: ExamCandidate[];
  cycles: CycleCandidate[];
}): CycleMatchResult {
  const t = norm(input.title);

  // 1. Which exam?
  let examId: string | null = null;
  let examByName = false;
  if (input.sourceExamId) {
    examId = input.sourceExamId;
  } else {
    const named = input.exams.filter((e) => {
      const names = [e.shortName, e.name].map((n) => norm(n)).filter((n) => n.trim().length >= 3);
      return names.some((n) => t.includes(n));
    });
    if (named.length === 0) return none("No exam name found in the title and the source is not tied to one exam.");
    if (named.length > 1) return none("The title names more than one exam.");
    examId = (named[0] as ExamCandidate).id;
    examByName = true;
  }

  const cycles = input.cycles.filter((c) => c.examId === examId);
  if (cycles.length === 0) return none("The exam has no published cycle yet.", examId);

  // 2. Cycle label written in the title.
  const labelHits = cycles.filter((c) => {
    const label = norm(c.cycleLabel);
    return label.trim().length >= 4 && t.includes(label);
  });
  if (labelHits.length === 1) {
    const hit = labelHits[0] as CycleCandidate;
    return { cycleId: hit.id, examId, via: "cycle_label", reason: `Title contains the cycle label "${hit.cycleLabel}".` };
  }
  if (labelHits.length > 1) return none("The title matches more than one cycle label.", examId);

  // 3. Years in the title.
  const years = titleYears(input.title);
  if (years.length > 0) {
    const yearHits = cycles.filter((c) => years.some((y) => c.cycleLabel.includes(y)));
    if (yearHits.length === 1) {
      const hit = yearHits[0] as CycleCandidate;
      return { cycleId: hit.id, examId, via: "cycle_label", reason: `Year ${years.join("/")} in the title matches cycle "${hit.cycleLabel}".` };
    }
    if (yearHits.length > 1) return none("The year in the title matches more than one cycle.", examId);
    return none(`The title mentions ${years.join("/")}, which matches no known cycle.`, examId);
  }

  // 4. Nothing in the title to disambiguate: only safe with a single cycle.
  if (cycles.length === 1) {
    const only = cycles[0] as CycleCandidate;
    return {
      cycleId: only.id,
      examId,
      via: examByName ? "exam_name" : "single_candidate",
      reason: "The exam has exactly one published cycle and the title names no other year.",
    };
  }
  return none("The exam has several cycles and the title does not say which.", examId);
}
