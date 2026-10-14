import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-level tests with an in-memory fake of the Supabase query builder.
// They run the REAL action code and assert what it asked the database to do
// (filters, payloads, order). They do not talk to a real Supabase project, so
// RLS itself is NOT exercised here — see supabase/tests/phase11_rls_check.sql.

const h = vi.hoisted(() => {
  interface Call {
    table: string;
    op: "select" | "insert" | "update" | "delete" | "upsert";
    filters: [string, string, unknown][];
    payload?: unknown;
    single: boolean;
  }
  interface FakeResult { data?: unknown; error?: unknown; count?: number | null }
  type Resolver = (c: Call) => FakeResult;

  class FakeQuery implements PromiseLike<FakeResult> {
    constructor(private call: Call, private resolve: Resolver) {}
    select() { return this; }
    insert(p: unknown) { this.call.op = "insert"; this.call.payload = p; return this; }
    update(p: unknown) { this.call.op = "update"; this.call.payload = p; return this; }
    upsert(p: unknown) { this.call.op = "upsert"; this.call.payload = p; return this; }
    delete() { this.call.op = "delete"; return this; }
    eq(c: string, v: unknown) { this.call.filters.push(["eq", c, v]); return this; }
    in(c: string, v: unknown) { this.call.filters.push(["in", c, v]); return this; }
    not(c: string, _o: string, v: unknown) { this.call.filters.push(["not", c, v]); return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { this.call.single = true; return this; }
    single() { this.call.single = true; return this; }
    then<T1 = FakeResult, T2 = never>(
      onF?: ((v: FakeResult) => T1 | PromiseLike<T1>) | null,
      onR?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      const r = this.resolve(this.call);
      const out = this.call.single && Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r;
      return Promise.resolve(out).then(onF, onR);
    }
  }

  const state = {
    userCalls: [] as Call[],
    adminCalls: [] as Call[],
    resolveUser: ((): FakeResult => ({ data: [] })) as Resolver,
    resolveAdmin: ((): FakeResult => ({ data: [] })) as Resolver,
    isAdmin: true,
  };

  function makeClient(kind: "user" | "admin") {
    return {
      from(table: string) {
        const call: Call = { table, op: "select", filters: [], single: false };
        (kind === "user" ? state.userCalls : state.adminCalls).push(call);
        return new FakeQuery(call, (c) => {
          if (kind === "user" && c.table === "admins") return { data: state.isAdmin ? [{ user_id: "admin-1" }] : [] };
          return kind === "user" ? state.resolveUser(c) : state.resolveAdmin(c);
        });
      },
      storage: { from: () => ({ remove: async () => ({ data: [], error: null }), upload: async () => ({ data: {}, error: null }) }) },
    };
  }
  return { state, makeClient };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/session", () => ({
  requireUser: async () => ({
    ok: true, supabase: h.makeClient("user"), user: { id: h.state.isAdmin ? "admin-1" : "user-1" },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.makeClient("admin") }));

import {
  claimRequestAction, setOfficialStageAction, startFormFillingAction, updateRequestStatusAction,
} from "../application-requests-admin";
import { approveFilledFormAction, completeMyActionAction, requestFormChangesAction } from "../application-requests";
import { syncRequestsForOfficialUpdate } from "@/lib/application-requests/official-sync";

const REQ = "5f0c2d8e-6b3a-4c1e-9d6a-1a2b3c4d5e6f";
type R = Record<string, unknown>;
const request = (over: R = {}): R => ({
  id: REQ, user_id: "user-1", request_code: "AR-TEST0001", status: "in_progress", assistance_type: "full_application",
  latest_update: null, admin_message: null, official_reference_number: null, completed_at: null, purge_after: null,
  user_action_note: null, official_stage: "not_submitted", submitted_on_portal_at: null, application_deadline: null,
  updated_at: "2026-10-01T00:00:00Z", ...over,
});
const writes = (calls: { op: string; table: string }[], table: string, op: string) =>
  calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  h.state.userCalls = [];
  h.state.adminCalls = [];
  h.state.isAdmin = true;
  h.state.resolveUser = () => ({ data: [] });
  h.state.resolveAdmin = () => ({ data: [] });
});

/** Admin client resolver for the status action. */
function adminResolver(req: R, opts: { updateRows?: R[]; eventsError?: boolean; notifyError?: boolean } = {}) {
  return (c: { table: string; op: string }) => {
    if (c.table === "application_requests" && c.op === "select") return { data: [req] };
    if (c.table === "application_request_documents") return { data: [], count: 0 };
    if (c.table === "application_requests" && c.op === "update") return { data: opts.updateRows ?? [{ id: REQ }] };
    if (c.table === "application_request_events" && c.op === "insert") {
      return opts.eventsError ? { data: null, error: { code: "XX" } } : { data: [{ id: "ev-1" }] };
    }
    if (c.table === "notifications") return opts.notifyError ? { error: { code: "XX" } } : { data: [] };
    return { data: [] };
  };
}

describe("admin authorization", () => {
  it("rejects every Phase 11 admin action for a non-admin before touching data", async () => {
    h.state.isAdmin = false;
    const results = await Promise.all([
      updateRequestStatusAction({ requestId: REQ, toStatus: "under_review" }),
      claimRequestAction(REQ),
      startFormFillingAction(REQ),
      setOfficialStageAction({ requestId: REQ, stage: "result" }),
    ]);
    for (const r of results) expect(r.error).toBeTruthy();
    expect(h.state.adminCalls).toHaveLength(0); // service-role client never used
  });
});

describe("updateRequestStatusAction (Phase 11)", () => {
  it("marks form_filled with a conditional update, an event and a GENERIC notification", async () => {
    h.state.resolveAdmin = adminResolver(request());
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "form_filled", message: "Check DOB 01-01-1999 carefully" });
    expect(res).toEqual({});
    const upd = writes(h.state.adminCalls, "application_requests", "update")[0] as unknown as { filters: [string, string, unknown][]; payload: R };
    expect(upd.filters).toContainEqual(["eq", "status", "in_progress"]); // optimistic concurrency
    expect(upd.payload.status).toBe("form_filled");
    expect(upd.payload.official_stage).toBeUndefined(); // form filled is NOT an official submission
    expect(upd.payload.submitted_on_portal_at).toBeUndefined();
    const ev = (writes(h.state.adminCalls, "application_request_events", "insert")[0] as unknown as { payload: R[] }).payload[0]!;
    expect(ev.to_status).toBe("form_filled");
    const note = (writes(h.state.adminCalls, "notifications", "upsert")[0] as unknown as { payload: R }).payload;
    expect(note.dedupe_key).toBe(`apprequest:${REQ}:ev-1`);
    expect(String(note.body)).not.toContain("01-01-1999"); // admin free text never goes into notifications
  });

  it("refuses submitted_on_portal without a reference or confirmation document", async () => {
    h.state.resolveAdmin = adminResolver(request({ status: "awaiting_user_action" }));
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "submitted_on_portal" });
    expect(res.error).toMatch(/confirmed|reference/i);
    expect(writes(h.state.adminCalls, "application_requests", "update")).toHaveLength(0);
  });

  it("sets the official stage only when submission is confirmed with a reference", async () => {
    h.state.resolveAdmin = adminResolver(request({ status: "awaiting_user_action" }));
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "submitted_on_portal", officialReferenceNumber: "REF-9" });
    expect(res).toEqual({});
    const upd = writes(h.state.adminCalls, "application_requests", "update")[0] as unknown as { payload: R };
    expect(upd.payload.official_stage).toBe("submitted");
    expect(upd.payload.official_reference_number).toBe("REF-9");
    expect(upd.payload.submitted_on_portal_at).toBeTruthy();
  });

  it("reports a conflict (zero rows updated) instead of success", async () => {
    h.state.resolveAdmin = adminResolver(request(), { updateRows: [] });
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "form_filled", message: "Review please" });
    expect(res.error).toMatch(/changed by someone else/i);
    expect(writes(h.state.adminCalls, "application_request_events", "insert")).toHaveLength(0);
  });

  it("restores the request when the history row can't be written", async () => {
    h.state.resolveAdmin = adminResolver(request(), { eventsError: true });
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "form_filled", message: "Review please" });
    expect(res.error).toMatch(/not applied/i);
    const updates = writes(h.state.adminCalls, "application_requests", "update") as unknown as { payload: R }[];
    expect(updates).toHaveLength(2);
    expect(updates[1]!.payload.status).toBe("in_progress"); // reverted
  });

  it("saves the change but WARNS the admin when the notification fails", async () => {
    h.state.resolveAdmin = adminResolver(request(), { notifyError: true });
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "form_filled", message: "Review please" });
    expect(res.error).toBeUndefined();
    expect(res.warning).toMatch(/could not be notified/i);
    const failed = (writes(h.state.adminCalls, "application_request_events", "insert") as unknown as { payload: R }[])
      .find((c) => (c.payload as R).event_type === "notification_failed");
    expect((failed!.payload as R).visibility).toBe("internal"); // failure logged internally, never shown to the applicant
  });

  it("blocks accepting a request whose deadline already passed", async () => {
    h.state.resolveAdmin = adminResolver(request({ status: "under_review", application_deadline: "2000-01-01" }));
    const res = await updateRequestStatusAction({ requestId: REQ, toStatus: "in_progress" });
    expect(res.error).toMatch(/passed/i);
  });
});

describe("claim / form filling / official stage", () => {
  it("claims an unassigned request and logs it as an INTERNAL event", async () => {
    h.state.resolveAdmin = (c) => {
      if (c.table === "application_requests") return { data: [{ id: REQ }] };
      if (c.table === "application_request_assignments" && c.op === "select") return { data: null };
      return { data: [] };
    };
    expect(await claimRequestAction(REQ)).toEqual({});
    expect(writes(h.state.adminCalls, "application_request_assignments", "insert")).toHaveLength(1);
    const ev = (writes(h.state.adminCalls, "application_request_events", "insert")[0] as unknown as { payload: R }).payload;
    expect(ev.visibility).toBe("internal");
  });

  it("won't silently steal another admin's request", async () => {
    h.state.resolveAdmin = (c) => {
      if (c.table === "application_requests") return { data: [{ id: REQ }] };
      if (c.table === "application_request_assignments" && c.op === "select") return { data: [{ admin_id: "other-admin" }] };
      return { data: [] };
    };
    const res = await claimRequestAction(REQ);
    expect(res.error).toMatch(/another admin/i);
    expect(writes(h.state.adminCalls, "application_request_assignments", "update")).toHaveLength(0);
  });

  it("refuses to record an official stage before submission is confirmed", async () => {
    h.state.resolveAdmin = adminResolver(request({ status: "form_filled" }));
    const res = await setOfficialStageAction({ requestId: REQ, stage: "admit_card" });
    expect(res.error).toMatch(/confirmed as submitted/i);
  });

  it("records a later stage for a confirmed request, forward only", async () => {
    h.state.resolveAdmin = adminResolver(request({ status: "submitted_on_portal", official_stage: "submitted" }));
    expect(await setOfficialStageAction({ requestId: REQ, stage: "admit_card" })).toEqual({});
    h.state.resolveAdmin = adminResolver(request({ status: "completed", official_stage: "result" }));
    expect((await setOfficialStageAction({ requestId: REQ, stage: "admit_card" })).error).toMatch(/isn't ahead/i);
  });

  it("starts form filling only once", async () => {
    h.state.resolveAdmin = (c) => {
      if (c.table === "application_requests") return { data: [request()] };
      if (c.table === "application_request_events" && c.op === "select") return { data: [], count: 1 };
      return { data: [] };
    };
    expect((await startFormFillingAction(REQ)).error).toMatch(/already/i);
  });
});

describe("applicant steps (ownership + conditional updates)", () => {
  beforeEach(() => { h.state.isAdmin = false; }); // the caller is the applicant, user-1
  const owned = (over: R = {}) => (c: { table: string; op: string }) =>
    c.table === "application_requests" && c.op === "select" ? { data: [request({ status: "form_filled", ...over })] } : { data: [] };

  it("approving moves form_filled → awaiting_user_action, never to submitted", async () => {
    h.state.resolveUser = owned();
    h.state.resolveAdmin = (c) => (c.op === "update" ? { data: [{ id: REQ }] } : { data: [] });
    expect(await approveFilledFormAction(REQ)).toEqual({});
    const upd = writes(h.state.adminCalls, "application_requests", "update")[0] as unknown as { filters: [string, string, unknown][]; payload: R };
    expect(upd.payload.status).toBe("awaiting_user_action");
    expect(upd.filters).toContainEqual(["eq", "user_id", "user-1"]);
    expect(upd.filters).toContainEqual(["eq", "status", "form_filled"]);
    expect(upd.payload.official_stage).toBeUndefined();
  });

  it("can't act on someone else's request (not found) or in the wrong status", async () => {
    h.state.resolveUser = () => ({ data: [] }); // RLS/ownership filter returns nothing
    expect((await approveFilledFormAction(REQ)).error).toMatch(/not found/i);
    h.state.resolveUser = owned({ status: "in_progress" });
    expect((await approveFilledFormAction(REQ)).error).toMatch(/isn't waiting/i);
    expect(h.state.adminCalls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("requires a reason when asking for changes and returns to in_progress", async () => {
    h.state.resolveUser = owned();
    expect((await requestFormChangesAction(REQ, "  ")).error).toBeTruthy();
    h.state.resolveAdmin = (c) => (c.op === "update" ? { data: [{ id: REQ }] } : { data: [] });
    expect(await requestFormChangesAction(REQ, "Father's name is misspelt")).toEqual({});
    const upd = writes(h.state.adminCalls, "application_requests", "update")[0] as unknown as { payload: R };
    expect(upd.payload.status).toBe("in_progress");
  });

  it("'I completed my step' keeps a typed number as REPORTED and never sets the official reference", async () => {
    h.state.resolveUser = owned({ status: "awaiting_user_action" });
    h.state.resolveAdmin = (c) => (c.op === "update" ? { data: [{ id: REQ }] } : { data: [] });
    const fd = new FormData();
    fd.set("requestId", REQ);
    fd.set("reportedReference", "APP-1234");
    expect(await completeMyActionAction(fd)).toEqual({});
    const upd = writes(h.state.adminCalls, "application_requests", "update")[0] as unknown as { payload: R };
    expect(upd.payload.status).toBe("in_progress");
    expect(upd.payload.official_reference_number).toBeUndefined();
    expect(upd.payload.official_stage).toBeUndefined();
    const ev = (writes(h.state.adminCalls, "application_request_events", "insert")[0] as unknown as { payload: R }).payload;
    expect(String(ev.message)).toMatch(/not yet verified/);
  });

  it("reverts the status when the audit event can't be written", async () => {
    h.state.resolveUser = owned();
    h.state.resolveAdmin = (c) => {
      if (c.op === "update") return { data: [{ id: REQ }] };
      if (c.op === "insert") return { error: { code: "XX" } };
      return { data: [] };
    };
    expect((await approveFilledFormAction(REQ)).error).toBeTruthy();
    const updates = writes(h.state.adminCalls, "application_requests", "update") as unknown as { payload: R }[];
    expect(updates[1]!.payload.status).toBe("form_filled");
  });
});

describe("syncRequestsForOfficialUpdate (official-update integration)", () => {
  const params = { updateId: "upd-1", updateType: "admit_card" as const, examCycleId: "cycle-1", examName: "SSC CGL", publicationDate: "2026-11-01" };
  const row = (over: R = {}) => ({ id: "r1", user_id: "u1", status: "submitted_on_portal", official_stage: "submitted", application_deadline: null, ...over });
  const client = () => h.makeClient("admin") as unknown as Parameters<typeof syncRequestsForOfficialUpdate>[1];

  function resolver(rows: R[], extra: Partial<Record<string, (c: { op: string }) => R>> = {}) {
    return (c: { table: string; op: string }) => {
      const custom = extra[c.table];
      if (custom) return custom(c);
      if (c.table === "application_requests" && c.op === "select") return { data: rows };
      if (c.table === "profiles") return { data: rows.map((r) => ({ user_id: r.user_id, notification_preferences: null })) };
      if (c.table === "notifications") return { data: [{ user_id: "u1" }] };
      return { data: [] };
    };
  }

  it("does nothing without an exam cycle (never guesses by name)", async () => {
    const res = await syncRequestsForOfficialUpdate({ ...params, examCycleId: null }, client());
    expect(res).toEqual({ matched: 0, recorded: 0, notified: 0, failed: 0 });
    expect(h.state.adminCalls).toHaveLength(0);
  });

  it("matches requests by exam_cycle_id only and skips rejected/cancelled", async () => {
    h.state.resolveAdmin = resolver([row()]);
    await syncRequestsForOfficialUpdate(params, client());
    const sel = h.state.adminCalls.find((c) => c.table === "application_requests" && c.op === "select")!;
    expect(sel.filters).toContainEqual(["eq", "exam_cycle_id", "cycle-1"]);
    expect(sel.filters.some((f) => f[0] === "not" && f[1] === "status")).toBe(true);
  });

  it("records a user-visible event, advances the stage and sends ONE deduplicated notification", async () => {
    h.state.resolveAdmin = resolver([row()]);
    const res = await syncRequestsForOfficialUpdate(params, client());
    expect(res).toMatchObject({ matched: 1, recorded: 1, notified: 1, failed: 0 });
    const ev = (writes(h.state.adminCalls, "application_request_events", "insert")[0] as unknown as { payload: R }).payload;
    expect(ev).toMatchObject({ event_type: "official_update", official_stage: "admit_card", dedupe_key: "official:upd-1", actor_role: "system" });
    expect(ev.visibility).toBeUndefined(); // defaults to 'user' = visible to the applicant
    expect(String(ev.message)).toMatch(/not checked your individual application/);
    const upd = writes(h.state.adminCalls, "application_requests", "update")[0] as unknown as { payload: R };
    expect(upd.payload.official_stage).toBe("admit_card");
    const note = (writes(h.state.adminCalls, "notifications", "upsert")[0] as unknown as { payload: R }).payload;
    expect(note.dedupe_key).toBe("update:upd-1");
    expect(note.type).toBe("admit_card");
  });

  it("does not advance an unsubmitted request's stage, but still records the notice", async () => {
    h.state.resolveAdmin = resolver([row({ status: "form_filled", official_stage: "not_submitted" })]);
    const res = await syncRequestsForOfficialUpdate(params, client());
    expect(res.recorded).toBe(1);
    expect(writes(h.state.adminCalls, "application_requests", "update")).toHaveLength(0);
  });

  it("is idempotent: a duplicate event (23505) is skipped with no stage change or notification", async () => {
    h.state.resolveAdmin = resolver([row()], {
      application_request_events: () => ({ error: { code: "23505" } }),
    });
    const res = await syncRequestsForOfficialUpdate(params, client());
    expect(res).toMatchObject({ recorded: 0, notified: 0, failed: 0 });
    expect(writes(h.state.adminCalls, "application_requests", "update")).toHaveLength(0);
    expect(writes(h.state.adminCalls, "notifications", "upsert")).toHaveLength(0);
  });

  it("respects the user's notification preferences", async () => {
    h.state.resolveAdmin = resolver([row()], {
      profiles: () => ({ data: [{ user_id: "u1", notification_preferences: { admit_card: false } }] }),
    });
    const res = await syncRequestsForOfficialUpdate(params, client());
    expect(res.recorded).toBe(1);
    expect(writes(h.state.adminCalls, "notifications", "upsert")).toHaveLength(0);
  });

  it("counts a failed notification without throwing and keeps the recorded event", async () => {
    h.state.resolveAdmin = resolver([row()], { notifications: () => ({ error: { code: "XX" } }) });
    const res = await syncRequestsForOfficialUpdate(params, client());
    expect(res).toMatchObject({ recorded: 1, notified: 0, failed: 1 });
  });

  it("undoes the timeline event if the stage update fails", async () => {
    h.state.resolveAdmin = resolver([row()], {
      application_requests: (c) => (c.op === "update" ? { error: { code: "XX" } } : { data: [row()] }),
    });
    const res = await syncRequestsForOfficialUpdate(params, client());
    expect(res.failed).toBe(1);
    expect(writes(h.state.adminCalls, "application_request_events", "delete")).toHaveLength(1);
  });
});
