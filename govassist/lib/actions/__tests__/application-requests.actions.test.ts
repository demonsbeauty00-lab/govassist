import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Action-level tests with an in-memory fake of the Supabase query builder.
// The fake records every call (table, operation, filters, payload) and
// returns whatever the test's resolver says, so these tests exercise the
// REAL action code and assert exactly what it asked the database to do.
// They do not talk to a real Supabase project (no RLS is exercised here).
// ---------------------------------------------------------------------------

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
    removed: { user: [] as string[][], admin: [] as string[][] },
    signed: { user: [] as string[], admin: [] as string[] },
    resolveUser: ((): FakeResult => ({ data: [] })) as Resolver,
    resolveAdmin: ((): FakeResult => ({ data: [] })) as Resolver,
  };

  function makeClient(kind: "user" | "admin") {
    return {
      from(table: string) {
        const call: Call = { table, op: "select", filters: [], single: false };
        (kind === "user" ? state.userCalls : state.adminCalls).push(call);
        return new FakeQuery(call, (c) => (kind === "user" ? state.resolveUser(c) : state.resolveAdmin(c)));
      },
      storage: {
        from() {
          return {
            remove: async (paths: string[]) => { state.removed[kind].push(paths); return { data: [], error: null }; },
            upload: async () => ({ data: {}, error: null }),
            createSignedUrl: async (path: string) => {
              state.signed[kind].push(path);
              return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
            },
          };
        },
      },
    };
  }
  return { state, makeClient };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/session", () => ({
  requireUser: async () => ({ ok: true, supabase: h.makeClient("user"), user: { id: "user-1" } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.makeClient("admin") }));

import {
  deleteMyRequestDocumentsAction, getMyDocumentUrlAction, replyToRequestAction,
} from "../application-requests";

const REQ_ID = "5f0c2d8e-6b3a-4c1e-9d6a-1a2b3c4d5e6f";
const baseRequest = {
  id: REQ_ID, user_id: "user-1", status: "completed", latest_update: null, purge_after: null, updated_at: "2026-10-01T00:00:00Z",
};
const userDoc = { id: "d1", storage_path: "user-1/application-requests/req/a.pdf", uploaded_by: "user", kind: "supporting" };
const adminDoc = { id: "d2", storage_path: "admin-confirmations/req/c.pdf", uploaded_by: "admin", kind: "confirmation" };

function replyForm(): FormData {
  const fd = new FormData();
  fd.set("requestId", REQ_ID);
  fd.set("message", "Here is the missing information.");
  return fd;
}

beforeEach(() => {
  h.state.userCalls.length = 0;
  h.state.adminCalls.length = 0;
  h.state.removed.user.length = 0;
  h.state.removed.admin.length = 0;
  h.state.signed.user.length = 0;
  h.state.signed.admin.length = 0;
  h.state.resolveUser = () => ({ data: [] });
  h.state.resolveAdmin = () => ({ data: [] });
});

describe("deleteMyRequestDocumentsAction", () => {
  function setup(status: string, docs: unknown[]) {
    h.state.resolveUser = (c) => {
      if (c.table === "application_requests") return { data: [{ ...baseRequest, status }] };
      if (c.table === "application_request_documents") return { data: docs };
      return { data: [] };
    };
  }

  it("removes only the applicant's own files and never the admin confirmation", async () => {
    setup("completed", [userDoc, adminDoc]);
    const res = await deleteMyRequestDocumentsAction(REQ_ID);
    expect(res).toEqual({});
    expect(h.state.removed.user).toEqual([[userDoc.storage_path]]);
    expect(h.state.removed.admin).toHaveLength(0);

    const del = h.state.adminCalls.find((c) => c.table === "application_request_documents" && c.op === "delete");
    expect(del).toBeDefined();
    expect(del?.filters).toContainEqual(["in", "id", ["d1"]]);
    expect(del?.filters).toContainEqual(["eq", "uploaded_by", "user"]);
    expect(del?.filters).toContainEqual(["eq", "kind", "supporting"]);

    // request row and history are never deleted
    expect(h.state.adminCalls.some((c) => c.table === "application_requests" && c.op === "delete")).toBe(false);
    expect(h.state.adminCalls.some((c) => c.table === "application_request_events" && c.op === "delete")).toBe(false);
  });

  it("returns a clear message when only admin documents exist", async () => {
    setup("completed", [adminDoc]);
    const res = await deleteMyRequestDocumentsAction(REQ_ID);
    expect(res.error).toMatch(/no documents uploaded by you/i);
    expect(h.state.removed.user).toHaveLength(0);
    expect(h.state.adminCalls.some((c) => c.op === "delete")).toBe(false);
  });

  it("refuses while the request is still open", async () => {
    setup("in_progress", [userDoc]);
    const res = await deleteMyRequestDocumentsAction(REQ_ID);
    expect(res.error).toMatch(/once the request is closed/i);
    expect(h.state.removed.user).toHaveLength(0);
  });

  it("does not touch another user's request", async () => {
    h.state.resolveUser = () => ({ data: [{ ...baseRequest, user_id: "someone-else" }] });
    const res = await deleteMyRequestDocumentsAction(REQ_ID);
    expect(res.error).toBe("Request not found.");
    expect(h.state.removed.user).toHaveLength(0);
  });
});

describe("replyToRequestAction", () => {
  function setup() {
    h.state.resolveUser = (c) => {
      if (c.table === "application_requests") return { data: [{ ...baseRequest, status: "waiting_for_user" }] };
      if (c.table === "application_request_documents") return { data: [], count: 0 };
      if (c.table === "application_request_events" && c.op === "insert") return { data: [{ id: "ev-1" }] };
      return { data: [] };
    };
  }
  const statusEvents = () =>
    h.state.adminCalls.filter((c) => c.table === "application_request_events" && c.op === "insert");

  it("succeeds and writes exactly one status_changed event when the transition applies", async () => {
    setup();
    h.state.resolveAdmin = (c) => (c.table === "application_requests" && c.op === "update" ? { data: [{ id: REQ_ID }] } : { data: [] });
    const res = await replyToRequestAction(replyForm());
    expect(res).toEqual({});
    expect(statusEvents()).toHaveLength(1);
    expect(h.state.adminCalls.some((c) => c.op === "delete")).toBe(false);
    const upd = h.state.adminCalls.find((c) => c.table === "application_requests" && c.op === "update");
    expect(upd?.filters).toContainEqual(["eq", "status", "waiting_for_user"]);
    expect(upd?.filters).toContainEqual(["eq", "user_id", "user-1"]);
  });

  it("reports failure, rolls the reply back and writes no status event when zero rows changed", async () => {
    setup();
    h.state.resolveAdmin = () => ({ data: [] }); // update affected 0 rows
    const res = await replyToRequestAction(replyForm());
    expect(res.error).toMatch(/no longer needs your reply/i);
    expect(statusEvents()).toHaveLength(0);
    const rollback = h.state.adminCalls.find((c) => c.table === "application_request_events" && c.op === "delete");
    expect(rollback?.filters).toContainEqual(["eq", "id", "ev-1"]);
  });

  it("reports failure and rolls back when the status update errors", async () => {
    setup();
    h.state.resolveAdmin = (c) => (c.op === "update" ? { data: null, error: { code: "XX000" } } : { data: [] });
    const res = await replyToRequestAction(replyForm());
    expect(res.error).toMatch(/couldn't send your reply/i);
    expect(statusEvents()).toHaveLength(0);
    expect(h.state.adminCalls.some((c) => c.table === "application_request_events" && c.op === "delete")).toBe(true);
  });

  it("rejects a reply when the request isn't waiting for the user", async () => {
    h.state.resolveUser = (c) => (c.table === "application_requests" ? { data: [{ ...baseRequest, status: "in_progress" }] } : { data: [] });
    const res = await replyToRequestAction(replyForm());
    expect(res.error).toMatch(/isn't waiting for your reply/i);
    expect(h.state.adminCalls).toHaveLength(0);
  });
});

describe("getMyDocumentUrlAction", () => {
  it("refuses another user's document and issues no URL", async () => {
    h.state.resolveUser = () => ({ data: [{ storage_path: "x", user_id: "someone-else", uploaded_by: "user" }] });
    const res = await getMyDocumentUrlAction("d1");
    expect(res.error).toBe("Document not found.");
    expect(h.state.signed.user).toHaveLength(0);
    expect(h.state.signed.admin).toHaveLength(0);
  });

  it("signs admin-uploaded confirmations server-side, only after the ownership check", async () => {
    h.state.resolveUser = () => ({ data: [{ storage_path: adminDoc.storage_path, user_id: "user-1", uploaded_by: "admin" }] });
    const res = await getMyDocumentUrlAction("d2");
    expect(res.url).toContain("admin-confirmations/");
    expect(h.state.signed.admin).toEqual([adminDoc.storage_path]);
    expect(h.state.signed.user).toHaveLength(0);
  });

  it("signs the applicant's own files with their own session", async () => {
    h.state.resolveUser = () => ({ data: [{ storage_path: userDoc.storage_path, user_id: "user-1", uploaded_by: "user" }] });
    const res = await getMyDocumentUrlAction("d1");
    expect(res.url).toBeDefined();
    expect(h.state.signed.user).toEqual([userDoc.storage_path]);
  });
});
