// ---------------------------------------------------------------------------
// Domain types
//
// These mirror the planned backend schema (Exam / ExamCycle / EligibilityResult
// etc. — see architecture doc) but are intentionally kept independent of any
// ORM/ DB types. The frontend only ever knows about these shapes; when Phase 2
// wires up real APIs, only lib/api/*.ts (not yet created) and the data-fetching
// hooks need to change — components and pages consume these types either way.
// ---------------------------------------------------------------------------

import { EligibilityRules, EligibilityCategory } from "./eligibility/types";

export type ExamCategory =
  | "SSC"
  | "Railways"
  | "Banking"
  | "Police"
  | "Defence"
  | "Teaching"
  | "State Government"
  | "Other";

export type ApplicationWindowStatus =
  | "opening_soon"
  | "open"
  | "closing_soon"
  | "closed";

export type MyExamBucket =
  | "potentially_eligible"
  | "saved"
  | "applied"
  | "upcoming"
  | "completed";

export interface ImportantDate {
  label: string;
  date: string; // ISO date
  isTentative?: boolean;
}

export interface ExamCycle {
  id: string;
  examName: string;
  shortName: string;
  organization: string;
  category: ExamCategory;
  state?: string; // undefined = all-India exam
  cycleLabel: string; // e.g. "2026"
  post?: string;
  qualificationSummary: string;
  ageRange: string;
  vacancies?: number;
  officialNotificationUrl: string;
  officialApplicationUrl?: string;
  officialWebsite: string;
  notificationDate: string;
  lastVerifiedDate: string;
  applicationWindow: {
    startDate: string;
    endDate: string;
    status: ApplicationWindowStatus;
  };
  admitCardDate?: string;
  answerKeyDate?: string;
  resultDate?: string;
  importantDates: ImportantDate[];
  examPattern: {
    tierLabel: string;
    sections: string[];
    duration: string;
    negativeMarking: string;
  }[];
  syllabusSummary?: string;
  markingSchemeSummary?: string;
  /** Structured, per-cycle eligibility rules for the engine (see
   *  lib/eligibility/engine.ts) — never a hand-authored pass/fail verdict.
   *  The actual result is computed live against the signed-in user's
   *  profile wherever it's shown. */
  rules: EligibilityRules;
}

/** An exam bundled with its live-computed eligibility category — the shape
 *  every list page passes down to ExamCard, computed once server-side via
 *  evaluateEligibility() rather than recomputed per-card. */
export interface ExamWithEligibility {
  exam: ExamCycle;
  eligibilityCategory: EligibilityCategory;
}

// Document types now live in lib/document-types.ts, backed by the real
// `documents` table (see lib/actions/documents.ts) — the mock UserDocument
// shape that used to live here has been retired.

export type UserCategory = "General" | "OBC" | "SC" | "ST" | "EWS";

// UserProfile (the old mock profile shape) has been retired — real profile
// data now comes from Supabase (see Database["public"]["Tables"]["profiles"]
// in lib/supabase/database.types.ts).

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "deadline" | "admit_card" | "result" | "system";
  createdAt: string;
  isRead: boolean;
}
