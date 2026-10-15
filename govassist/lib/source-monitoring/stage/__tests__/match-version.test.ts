import { describe, it, expect } from "vitest";
import { matchCycle } from "../match-cycle";
import { documentKeyFor, isRevisionTitle, normalizeDocumentUrl, planVersioning, resolveAmbiguous, seriesKey, ExistingStageRow } from "../versioning";

const exams = [
  { id: "e1", name: "Staff Selection Combined Graduate Level", shortName: "SSC CGL" },
  { id: "e2", name: "Railway Group D", shortName: "RRB Group D" },
];
const cycles = [
  { id: "c1", examId: "e1", cycleLabel: "2026" },
  { id: "c2", examId: "e1", cycleLabel: "2027" },
  { id: "c3", examId: "e2", cycleLabel: "2027" },
];

describe("matchCycle", () => {
  it("uses the year in the title when the source covers one exam", () => {
    const r = matchCycle({ title: "Admit Card Tier I 2027", sourceExamId: "e1", exams, cycles });
    expect(r.cycleId).toBe("c2");
    expect(r.via).toBe("cycle_label");
  });
  it("does not attach to a cycle when the title's year matches none", () => {
    const r = matchCycle({ title: "Result 2024", sourceExamId: "e1", exams, cycles });
    expect(r.cycleId).toBeNull();
  });
  it("does not guess among several cycles when the title says nothing", () => {
    const r = matchCycle({ title: "Answer Key Tier I", sourceExamId: "e1", exams, cycles });
    expect(r.cycleId).toBeNull();
  });
  it("accepts a single cycle when nothing contradicts it", () => {
    const r = matchCycle({ title: "Answer Key", sourceExamId: "e2", exams, cycles });
    expect(r.cycleId).toBe("c3");
    expect(r.via).toBe("single_candidate");
  });
  it("finds the exam by name when the source is not tied to one", () => {
    const r = matchCycle({ title: "SSC CGL 2026 Admit Card", sourceExamId: null, exams, cycles });
    expect(r.cycleId).toBe("c1");
  });
  it("matches nothing when the title names two exams or none", () => {
    expect(matchCycle({ title: "SSC CGL and RRB Group D 2027 dates", sourceExamId: null, exams, cycles }).cycleId).toBeNull();
    expect(matchCycle({ title: "General notice 2027", sourceExamId: null, exams, cycles }).cycleId).toBeNull();
  });
});

describe("versioning helpers", () => {
  it("normalises URLs (fragment, trailing slash, utm, host case)", () => {
    expect(normalizeDocumentUrl("https://SSC.gov.in/a/b/?utm_source=x#top")).toBe("https://ssc.gov.in/a/b");
  });
  it("keys a page-only notice by page + title", () => {
    const a = documentKeyFor(null, "https://x.gov.in/n", "Admit Card A");
    const b = documentKeyFor(null, "https://x.gov.in/n", "Admit Card B");
    expect(a).not.toBe(b);
  });
  it("detects revision wording", () => {
    expect(isRevisionTitle("Revised Answer Key")).toBe(true);
    expect(isRevisionTitle("Answer Key")).toBe(false);
  });
  it("gives original and revised titles the same series, but not other tiers", () => {
    const a = seriesKey("Provisional Answer Key - Tier I (12.03.2027)", "answer_key");
    const b = seriesKey("Revised Answer Key - Tier I 2027", "answer_key");
    const c = seriesKey("Provisional Answer Key - Tier II", "answer_key");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

const row = (o: Partial<ExistingStageRow>): ExistingStageRow => ({
  id: "r1", seriesKey: "answer key tier i", documentKey: "https://x/a.pdf", publicationDate: "2027-03-10", isLatest: true, version: 1, ...o,
});
const base = { seriesKey: "answer key tier i", documentKey: "https://x/b.pdf", publicationDate: "2027-03-15", isRevision: false };

describe("planVersioning", () => {
  it("first document of a series is new, version 1", () => {
    const p = planVersioning({ ...base, existing: [] });
    expect(p).toMatchObject({ action: "new", version: 1 });
  });
  it("same document again is a duplicate", () => {
    expect(planVersioning({ ...base, documentKey: "https://x/a.pdf", existing: [row({})] }).action).toBe("duplicate");
  });
  it("a labelled revision supersedes the latest and bumps the version", () => {
    const p = planVersioning({ ...base, isRevision: true, existing: [row({})] });
    expect(p).toMatchObject({ action: "supersede", version: 2, supersedesIds: ["r1"] });
  });
  it("an unlabelled second document of the same series is ambiguous, until a human approves", () => {
    const p = planVersioning({ ...base, existing: [row({})] });
    expect(p.action).toBe("ambiguous");
    expect(resolveAmbiguous(p).action).toBe("supersede");
  });
  it("an older document arriving late stays in history behind the newer one", () => {
    const p = planVersioning({ ...base, publicationDate: "2027-03-01", isRevision: true, existing: [row({})] });
    expect(p).toMatchObject({ action: "historical", supersededById: "r1" });
  });
  it("a different series is independent", () => {
    expect(planVersioning({ ...base, seriesKey: "answer key tier ii", existing: [row({})] }).action).toBe("new");
  });
});
