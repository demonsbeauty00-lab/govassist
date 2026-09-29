import { describe, it, expect } from "vitest";
import { buildPersonalizedDashboard, DEADLINE_HORIZON_DAYS, ExamWithEligibilityInput } from "../personalized";
import { ExamCycle } from "@/lib/types";

const NOW = new Date("2026-06-01T00:00:00Z");

function iso(daysFromNow: number): string {
  return new Date(NOW.getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

function exam(overrides: Partial<ExamCycle> = {}): ExamCycle {
  return {
    id: "ssc-cgl-2026",
    examName: "SSC Combined Graduate Level 2026",
    shortName: "SSC CGL 2026",
    organization: "Staff Selection Commission",
    category: "SSC",
    cycleLabel: "2026",
    qualificationSummary: "Graduate",
    ageRange: "18-32",
    officialNotificationUrl: "https://ssc.nic.in",
    officialWebsite: "https://ssc.nic.in",
    notificationDate: iso(-10),
    lastVerifiedDate: iso(-1),
    applicationWindow: { startDate: iso(-5), endDate: iso(10), status: "open" },
    importantDates: [],
    examPattern: [],
    rules: { ageMin: 18, ageMax: 32 } as ExamCycle["rules"],
    ...overrides,
  };
}

function input(exams: ExamWithEligibilityInput[], overrides: Partial<Parameters<typeof buildPersonalizedDashboard>[0]> = {}) {
  return buildPersonalizedDashboard({ exams, savedSlugs: [], now: NOW, answerKeyPapers: [], recentAttempts: [], ...overrides });
}

describe("buildPersonalizedDashboard — relevance filtering", () => {
  it("excludes an exam that is neither saved nor eligible", () => {
    const d = input([{ exam: exam(), eligibilityCategory: "likely_not_eligible" }]);
    expect(d.isEmpty).toBe(true);
    expect(d.applicationsOpen).toEqual([]);
  });

  it("includes a saved exam even when eligibility needs review", () => {
    const d = input([{ exam: exam(), eligibilityCategory: "needs_review" }], { savedSlugs: ["ssc-cgl-2026"] });
    expect(d.applicationsOpen).toHaveLength(1);
    expect(d.applicationsOpen[0]?.reasons).toEqual(["saved"]);
  });

  it("includes a potentially-eligible unsaved exam under suitableExams and applicationsOpen", () => {
    const d = input([{ exam: exam(), eligibilityCategory: "potentially_eligible" }]);
    expect(d.suitableExams).toHaveLength(1);
    expect(d.applicationsOpen).toHaveLength(1);
    expect(d.suitableExams[0]?.reasons).toEqual(["eligible"]);
  });

  it("never fabricates a result for a needs_review, unsaved exam", () => {
    const d = input([{ exam: exam(), eligibilityCategory: "needs_review" }]);
    expect(d.isEmpty).toBe(true);
  });
});

describe("buildPersonalizedDashboard — sections", () => {
  it("only lists a deadline within the horizon, not a far-off one", () => {
    const near = exam({ id: "near", applicationWindow: { startDate: iso(-1), endDate: iso(5), status: "closing_soon" } });
    const far = exam({ id: "far", applicationWindow: { startDate: iso(-1), endDate: iso(90), status: "open" } });
    const d = input(
      [
        { exam: near, eligibilityCategory: "potentially_eligible" },
        { exam: far, eligibilityCategory: "potentially_eligible" },
      ]
    );
    expect(d.upcomingDeadlines.map((x) => x.examId)).toEqual(["near"]);
    expect(d.applicationsOpen.map((x) => x.examId).sort()).toEqual(["far", "near"]);
  });

  it("excludes a passed deadline from upcomingDeadlines", () => {
    const passed = exam({ applicationWindow: { startDate: iso(-30), endDate: iso(-1), status: "closed" } });
    const d = input([{ exam: passed, eligibilityCategory: "potentially_eligible" }]);
    expect(d.upcomingDeadlines).toEqual([]);
  });

  it("puts a future important date under upcomingExams, sorted soonest first", () => {
    const e = exam({ importantDates: [{ label: "Tier I Exam Date", date: iso(20) }] });
    const d = input([{ exam: e, eligibilityCategory: "potentially_eligible" }], { savedSlugs: [e.id] });
    expect(d.upcomingExams).toHaveLength(1);
    expect(d.upcomingExams[0]?.daysLeft).toBe(20);
  });

  it("lists an admit card only once it's actually been released", () => {
    const notYet = exam({ id: "not-yet", admitCardDate: iso(5) });
    const released = exam({ id: "released", admitCardDate: iso(-2) });
    const d = input(
      [
        { exam: notYet, eligibilityCategory: "potentially_eligible" },
        { exam: released, eligibilityCategory: "potentially_eligible" },
      ]
    );
    expect(d.admitCards.map((x) => x.examId)).toEqual(["released"]);
  });

  it("lists a released result and stops surfacing it as an upcoming exam", () => {
    const e = exam({
      resultDate: iso(-1),
      importantDates: [{ label: "Tier I Exam Date", date: iso(-30) }],
    });
    const d = input([{ exam: e, eligibilityCategory: "potentially_eligible" }]);
    expect(d.results).toHaveLength(1);
  });

  it("caps every section at SECTION_LIMIT and does not silently show more", () => {
    const exams: ExamWithEligibilityInput[] = Array.from({ length: 8 }, (_, i) => ({
      exam: exam({ id: `e${i}`, applicationWindow: { startDate: iso(-1), endDate: iso(3 + i), status: "open" } }),
      eligibilityCategory: "potentially_eligible" as const,
    }));
    const d = input(exams);
    expect(d.applicationsOpen.length).toBeLessThanOrEqual(5);
  });

  it("passes through real answer-key papers and recent attempts unchanged, capped and ordered", () => {
    const d = input([], {
      answerKeyPapers: [{ paperId: "p1", title: "SSC CGL 2023", status: "final", publishedAt: iso(-2) }],
      recentAttempts: [
        { attemptId: "a1", paperTitle: "Old", percentage: 40, submittedAt: iso(-10) },
        { attemptId: "a2", paperTitle: "New", percentage: 80, submittedAt: iso(-1) },
      ],
    });
    expect(d.answerKeyPapers).toHaveLength(1);
    expect(d.recentAttempts[0]?.attemptId).toBe("a2"); // newest first
    expect(d.isEmpty).toBe(false);
  });

  it("is empty only when every section is genuinely empty", () => {
    const d = input([]);
    expect(d.isEmpty).toBe(true);
  });
});

describe("DEADLINE_HORIZON_DAYS", () => {
  it("is a real, positive window", () => {
    expect(DEADLINE_HORIZON_DAYS).toBeGreaterThan(0);
  });
});
