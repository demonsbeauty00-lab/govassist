// ---------------------------------------------------------------------------
// Personalized dashboard sections — Phase 8.
//
// A pure function that COMBINES results other engines already produced (the
// deterministic eligibility category per exam, the notification-status
// engine, the user's saved exams, real answer-key papers, real mock
// attempts) into the dashboard's sections. It computes nothing about
// eligibility itself and invents nothing: every item is an exam/paper/
// attempt that exists in the inputs, placed in a section by a date or status
// that's also in the inputs. No AI, no I/O — so what the dashboard says can
// be unit tested against fixtures.
//
// "Relevant" means: the user saved the exam, or the eligibility engine says
// potentially_eligible. An exam that's merely "needs_review" or
// "likely_not_eligible" and unsaved never appears — the dashboard isn't a
// catalog dump.
// ---------------------------------------------------------------------------

import { ExamCycle } from "@/lib/types";
import { EligibilityCategory } from "@/lib/eligibility/types";
import { computeNotificationStatus, deriveExamDate } from "@/lib/notifications/status";

export const SECTION_LIMIT = 5;
export const DEADLINE_HORIZON_DAYS = 30;

export interface ExamWithEligibilityInput {
  exam: ExamCycle;
  eligibilityCategory: EligibilityCategory;
}

export interface AnswerKeyPaperInput {
  paperId: string;
  title: string;
  status: "provisional" | "revised" | "final";
  publishedAt: string | null;
}

export interface RecentAttemptInput {
  attemptId: string;
  paperTitle: string;
  percentage: number | null;
  submittedAt: string;
}

export interface PersonalizedInput {
  exams: ExamWithEligibilityInput[];
  savedSlugs: string[];
  now: Date;
  answerKeyPapers: AnswerKeyPaperInput[];
  recentAttempts: RecentAttemptInput[];
}

export type RelevanceReason = "saved" | "eligible";

export interface DashboardExamItem {
  examId: string;
  shortName: string;
  organization: string;
  /** The date that placed it in this section (deadline / exam / release). */
  date: string | null;
  /** Whole days from now to `date`; negative or null when not applicable. */
  daysLeft: number | null;
  reasons: RelevanceReason[];
}

export interface PersonalizedDashboard {
  suitableExams: DashboardExamItem[];
  applicationsOpen: DashboardExamItem[];
  upcomingDeadlines: DashboardExamItem[];
  upcomingExams: DashboardExamItem[];
  admitCards: DashboardExamItem[];
  answerKeys: DashboardExamItem[];
  answerKeyPapers: AnswerKeyPaperInput[];
  results: DashboardExamItem[];
  recentAttempts: RecentAttemptInput[];
  /** True when there's nothing to show anywhere — the UI uses this to
   *  render one honest empty state instead of eight empty sections. */
  isEmpty: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set(["new", "applications_open", "closing_soon"]);

function daysUntil(dateIso: string, now: Date): number {
  return Math.ceil((new Date(dateIso).getTime() - now.getTime()) / DAY_MS);
}

export function buildPersonalizedDashboard(input: PersonalizedInput): PersonalizedDashboard {
  const nowIso = input.now.toISOString();
  const saved = new Set(input.savedSlugs);

  const relevant = input.exams
    .map(({ exam, eligibilityCategory }) => {
      const reasons: RelevanceReason[] = [];
      if (saved.has(exam.id)) reasons.push("saved");
      if (eligibilityCategory === "potentially_eligible") reasons.push("eligible");
      return { exam, reasons, status: computeNotificationStatus(exam, input.now), eligibilityCategory };
    })
    .filter((r) => r.reasons.length > 0);

  const item = (r: (typeof relevant)[number], date: string | null): DashboardExamItem => ({
    examId: r.exam.id,
    shortName: r.exam.shortName,
    organization: r.exam.organization,
    date,
    daysLeft: date ? daysUntil(date, input.now) : null,
    reasons: r.reasons,
  });

  const byDateAsc = (a: DashboardExamItem, b: DashboardExamItem) => (a.date ?? "").localeCompare(b.date ?? "");
  const byDateDesc = (a: DashboardExamItem, b: DashboardExamItem) => (b.date ?? "").localeCompare(a.date ?? "");

  const suitableExams = relevant
    .filter((r) => r.reasons.includes("eligible") && r.status !== "result_released")
    .map((r) => item(r, r.exam.applicationWindow.endDate))
    .sort(byDateAsc)
    .slice(0, SECTION_LIMIT);

  const openRows = relevant.filter((r) => OPEN_STATUSES.has(r.status));

  const applicationsOpen = openRows.map((r) => item(r, r.exam.applicationWindow.endDate)).sort(byDateAsc).slice(0, SECTION_LIMIT);

  const upcomingDeadlines = openRows
    .map((r) => item(r, r.exam.applicationWindow.endDate))
    .filter((i) => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= DEADLINE_HORIZON_DAYS)
    .sort(byDateAsc)
    .slice(0, SECTION_LIMIT);

  const upcomingExams = relevant
    .map((r) => ({ r, examDate: deriveExamDate(r.exam.importantDates) }))
    .filter(({ r, examDate }) => examDate !== null && examDate > nowIso && r.status !== "result_released")
    .map(({ r, examDate }) => item(r, examDate))
    .sort(byDateAsc)
    .slice(0, SECTION_LIMIT);

  const admitCards = relevant
    .filter((r) => r.exam.admitCardDate && r.exam.admitCardDate <= nowIso && r.status !== "result_released")
    .map((r) => item(r, r.exam.admitCardDate ?? null))
    .sort(byDateDesc)
    .slice(0, SECTION_LIMIT);

  const answerKeys = relevant
    .filter((r) => r.exam.answerKeyDate && r.exam.answerKeyDate <= nowIso)
    .map((r) => item(r, r.exam.answerKeyDate ?? null))
    .sort(byDateDesc)
    .slice(0, SECTION_LIMIT);

  const results = relevant
    .filter((r) => r.exam.resultDate && r.exam.resultDate <= nowIso)
    .map((r) => item(r, r.exam.resultDate ?? null))
    .sort(byDateDesc)
    .slice(0, SECTION_LIMIT);

  const answerKeyPapers = input.answerKeyPapers.slice(0, SECTION_LIMIT);
  const recentAttempts = [...input.recentAttempts].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 3);

  const isEmpty = [suitableExams, applicationsOpen, upcomingDeadlines, upcomingExams, admitCards, answerKeys, answerKeyPapers, results, recentAttempts].every(
    (list) => list.length === 0
  );

  return { suitableExams, applicationsOpen, upcomingDeadlines, upcomingExams, admitCards, answerKeys, answerKeyPapers, results, recentAttempts, isEmpty };
}
