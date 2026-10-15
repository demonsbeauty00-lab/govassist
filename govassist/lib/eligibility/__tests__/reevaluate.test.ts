import { describe, it, expect, beforeEach } from "vitest";
import { reevaluateCycle, reevaluateUser, sweepEligibility } from "../reevaluate";

// An in-memory fake of the parts of the Supabase client these jobs use. It
// really stores rows, so the tests check END STATE (what each user's stored
// classification is) rather than just which calls were made. It does not
// exercise RLS — see supabase/tests for the manual policy check.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let failUpsertOn: string | null = null;

class Q implements PromiseLike<{ data?: unknown; error?: unknown }> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private conflict: string[] = [];
  private from = 0;
  private to = Infinity;
  private single = false;
  private orderBy: string | null = null;
  constructor(private table: string) {}
  select() { return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  not(c: string, op: string, v: unknown) { if (op === "is" && v === null) this.filters.push((r) => r[c] != null); return this; }
  order(c: string) { this.orderBy = c; return this; }
  range(a: number, b: number) { this.from = a; this.to = b; return this; }
  limit(n: number) { this.to = n - 1; return this; }
  maybeSingle() { this.single = true; return this; }
  upsert(rows: Row | Row[], opts: { onConflict: string }) {
    this.op = "upsert"; this.payload = Array.isArray(rows) ? rows : [rows]; this.conflict = opts.onConflict.split(","); return this;
  }
  delete() { this.op = "delete"; return this; }
  then<T1, T2 = never>(f?: ((v: { data?: unknown; error?: unknown }) => T1 | PromiseLike<T1>) | null, r?: ((e: unknown) => T2 | PromiseLike<T2>) | null) {
    return Promise.resolve(this.run()).then(f, r);
  }
  private run(): { data?: unknown; error?: unknown } {
    const rows = (db[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === "upsert") {
      if (failUpsertOn === this.table) return { error: { code: "XX" } };
      for (const p of this.payload) {
        const i = rows.findIndex((r) => this.conflict.every((c) => r[c] === p[c]));
        if (i >= 0) rows[i] = { ...rows[i], ...p }; else rows.push({ ...p });
      }
      return { data: null };
    }
    if (this.op === "delete") {
      db[this.table] = rows.filter((r) => !match(r));
      return { data: null };
    }
    let out = rows.filter(match);
    if (this.orderBy) { const k = this.orderBy; out = [...out].sort((a, b) => String(a[k]).localeCompare(String(b[k]))); }
    out = out.slice(this.from, this.to + 1);
    return this.single ? { data: out[0] ?? null } : { data: out };
  }
}
const client = { from: (t: string) => new Q(t) } as unknown as Parameters<typeof reevaluateUser>[1];

const cycleRow = (over: Row = {}): Row => ({
  id: "c1", exam_id: "e1", cycle_label: "2026", status: "published", notification_date: "2026-06-01",
  last_verified_date: "2026-09-01", age_min: 18, age_max: 27, age_cutoff_date: "2026-08-01", age_relaxation_rules: {},
  required_degree: "Bachelor's Degree", required_subject: null, min_percentage: null, category_rules: {},
  domicile_required: false, gender_requirement: null, physical_requirements: null, experience_requirements: null,
  other_conditions: null, ...over,
});
const profileRow = (user: string, over: Row = {}): Row => ({
  user_id: user, dob: "2000-01-01", gender: "Male", category: "General", state: "Bihar", is_pwbd: false,
  onboarding_completed_at: "2026-09-01T00:00:00Z", ...over,
});
const gradRow = (user: string): Row => ({ user_id: user, qualification_level: "Graduate", subject: "Science", percentage_or_cgpa: "70%" });
const stored = (user: string, cycle: string) => db["exam_eligibility_results"]!.find((r) => r.user_id === user && r.exam_cycle_id === cycle);

beforeEach(() => {
  failUpsertOn = null;
  for (const k of Object.keys(db)) delete db[k];
  db["exams"] = [{ id: "e1", state: null }];
  db["exam_cycles"] = [cycleRow()];
  db["profiles"] = [profileRow("u1"), profileRow("u2", { dob: "1990-01-01" }), profileRow("u3", { onboarding_completed_at: null })];
  db["education"] = [gradRow("u1"), gradRow("u2"), gradRow("u3")];
  db["detected_updates"] = [];
  db["exam_eligibility_results"] = [];
  db["exam_eligibility_cycle_state"] = [];
});

describe("new exam cycles", () => {
  it("evaluates every onboarded user for a newly added published cycle, and nobody else", async () => {
    const res = await reevaluateCycle("c1", client);
    expect(res).toMatchObject({ users: 2, written: 2, failed: false });
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");
    expect(stored("u2", "c1")?.category).toBe("likely_not_eligible");
    expect(stored("u3", "c1")).toBeUndefined(); // onboarding not finished
    expect(db["exam_eligibility_cycle_state"]).toHaveLength(1);
  });

  it("the daily sweep detects a cycle that was added with no pipeline event", async () => {
    const res = await sweepEligibility(client);
    expect(res).toMatchObject({ cyclesChecked: 1, cyclesReevaluated: 1, failed: 0 });
    expect(stored("u1", "c1")).toBeTruthy();
    // A second run finds nothing new to do.
    expect(await sweepEligibility(client)).toMatchObject({ cyclesReevaluated: 0 });
  });

  it("ignores draft cycles", async () => {
    db["exam_cycles"] = [cycleRow({ status: "draft" })];
    expect(await sweepEligibility(client)).toMatchObject({ cyclesChecked: 0, cyclesReevaluated: 0 });
    expect(db["exam_eligibility_results"]).toHaveLength(0);
  });

  it("incomplete official rules are stored as Needs Review, never eligible", async () => {
    db["exam_cycles"] = [cycleRow({ age_min: null, age_max: null, required_degree: null })];
    await reevaluateCycle("c1", client);
    expect(stored("u1", "c1")?.category).toBe("needs_review");
    expect(stored("u2", "c1")?.category).toBe("needs_review"); // nothing published to fail against
  });

  it("is idempotent and skips an unchanged cycle", async () => {
    await reevaluateCycle("c1", client);
    const again = await reevaluateCycle("c1", client);
    expect(again.skipped).toBe("unchanged");
  });

  it("unpublishing a cycle removes its results", async () => {
    await reevaluateCycle("c1", client);
    db["exam_cycles"] = [cycleRow({ status: "archived" })];
    expect((await reevaluateCycle("c1", client)).skipped).toBe("not_published");
    expect(db["exam_eligibility_results"]).toHaveLength(0);
    expect(db["exam_eligibility_cycle_state"]).toHaveLength(0);
  });

  it("a failed write is not recorded as evaluated, so the next sweep retries", async () => {
    failUpsertOn = "exam_eligibility_results";
    const res = await reevaluateCycle("c1", client);
    expect(res.failed).toBe(true);
    expect(db["exam_eligibility_cycle_state"]).toHaveLength(0);
    failUpsertOn = null;
    expect(await sweepEligibility(client)).toMatchObject({ cyclesReevaluated: 1 });
    expect(stored("u1", "c1")).toBeTruthy();
  });
});

describe("eligibility rules change", () => {
  it("re-evaluates affected users when the published rules change", async () => {
    await reevaluateCycle("c1", client);
    expect(stored("u2", "c1")?.category).toBe("likely_not_eligible");
    db["exam_cycles"] = [cycleRow({ age_max: 40 })]; // rules edited in the database
    expect(await sweepEligibility(client)).toMatchObject({ cyclesReevaluated: 1 });
    expect(stored("u2", "c1")?.category).toBe("potentially_eligible");
    expect(stored("u2", "c1")?.previous_category).toBe("likely_not_eligible");
  });
});

describe("corrigendum", () => {
  it("a corrigendum published after the last verification moves results to Needs Review until rules are re-verified", async () => {
    await reevaluateCycle("c1", client);
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");

    db["detected_updates"] = [{ exam_cycle_id: "c1", update_type: "corrigendum", status: "published", processed_at: "2026-09-20T08:00:00Z" }];
    expect(await sweepEligibility(client)).toMatchObject({ cyclesReevaluated: 1 });
    expect(stored("u1", "c1")?.category).toBe("needs_review");
    expect(stored("u2", "c1")?.category).toBe("needs_review"); // a fail on possibly-stale rules isn't "clear"

    db["exam_cycles"] = [cycleRow({ last_verified_date: "2026-09-25" })]; // an admin re-verified the rules
    await sweepEligibility(client);
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");
    expect(stored("u2", "c1")?.category).toBe("likely_not_eligible");
  });

  it("ignores unpublished corrigenda", async () => {
    db["detected_updates"] = [{ exam_cycle_id: "c1", update_type: "corrigendum", status: "pending", processed_at: null }];
    await reevaluateCycle("c1", client);
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");
  });
});

describe("profile changes", () => {
  it("classifies every published cycle for a user after onboarding", async () => {
    db["exam_cycles"] = [cycleRow(), cycleRow({ id: "c2", cycle_label: "2027", age_max: 22 })];
    const res = await reevaluateUser("u1", client);
    expect(res).toMatchObject({ evaluated: 2, written: 2 });
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");
    expect(stored("u1", "c2")?.category).toBe("likely_not_eligible"); // 26 > 22
  });

  it("re-evaluates when the profile changes and records what changed", async () => {
    await reevaluateUser("u1", client);
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");
    (db["profiles"]!.find((p) => p.user_id === "u1") as Row).dob = "1990-01-01"; // user corrected their date of birth
    const res = await reevaluateUser("u1", client);
    expect(res.written).toBe(1);
    expect(stored("u1", "c1")).toMatchObject({ category: "likely_not_eligible", previous_category: "potentially_eligible" });
  });

  it("re-evaluates when education is added (missing information resolves)", async () => {
    db["education"] = db["education"]!.filter((e) => e.user_id !== "u1");
    await reevaluateUser("u1", client);
    expect(stored("u1", "c1")?.category).toBe("needs_review");
    db["education"]!.push(gradRow("u1"));
    await reevaluateUser("u1", client);
    expect(stored("u1", "c1")?.category).toBe("potentially_eligible");
  });

  it("writes nothing when nothing changed", async () => {
    await reevaluateUser("u1", client);
    expect(await reevaluateUser("u1", client)).toMatchObject({ evaluated: 1, written: 0 });
  });

  it("skips users with no profile or unfinished onboarding", async () => {
    expect((await reevaluateUser("nobody", client)).skipped).toBe("no_profile");
    expect((await reevaluateUser("u3", client)).skipped).toBe("onboarding_incomplete");
    expect(db["exam_eligibility_results"]).toHaveLength(0);
  });

  it("only touches the given user's rows", async () => {
    await reevaluateCycle("c1", client);
    const u2Before = JSON.stringify(stored("u2", "c1"));
    (db["profiles"]!.find((p) => p.user_id === "u1") as Row).category = "OBC";
    await reevaluateUser("u1", client);
    expect(JSON.stringify(stored("u2", "c1"))).toBe(u2Before);
  });

  it("drops stored results for cycles that are no longer published", async () => {
    await reevaluateUser("u1", client);
    db["exam_cycles"] = [];
    const res = await reevaluateUser("u1", client);
    expect(res.removed).toBe(1);
    expect(stored("u1", "c1")).toBeUndefined();
  });
});
