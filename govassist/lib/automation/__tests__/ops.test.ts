import { describe, it, expect } from "vitest";
import { clearParserMaintenance, recheckSource, retryFailedDeliveries, retryPublish, setSourceEnabled, type AuditEntry, type OpsDeps, type SourceSnapshot } from "../ops";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const SRC = "22222222-2222-2222-2222-222222222222";
const UPD = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-10-17T06:00:00Z");

function makeDeps(over: { source?: Partial<SourceSnapshot> | null; update?: { status: string; classification: string; detected_at: string } | null; check?: Awaited<ReturnType<OpsDeps["checkSource"]>>; apply?: { error?: string }; requeued?: number; saveOk?: boolean } = {}) {
  const calls = { check: 0, apply: 0, retry: 0, updates: [] as unknown[], audits: [] as AuditEntry[] };
  const source: SourceSnapshot | null = over.source === null ? null : { id: SRC, enabled: true, needs_parser_maintenance: false, last_checked_at: "2026-10-17T00:00:00Z", ...over.source };
  const deps: OpsDeps = {
    getSource: async () => source,
    updateSource: async (_id, patch) => { calls.updates.push(patch); return over.saveOk ?? true; },
    checkSource: async () => { calls.check += 1; return over.check ?? { ok: true, changed: true, updatesDetected: 2, duplicatesSkipped: 1, error: null }; },
    getUpdate: async () => (over.update === undefined ? { status: "pending", classification: "auto_publish", detected_at: "2026-10-17T00:00:00Z" } : over.update),
    applyUpdate: async () => { calls.apply += 1; return over.apply ?? {}; },
    requeueFailedDeliveries: async () => over.requeued ?? 3,
    runDeliveryRetry: async () => { calls.retry += 1; return { due: 3, sent: 2, failed: 1, skipped: 0 }; },
    audit: async (e) => { calls.audits.push(e); },
    now: () => NOW,
  };
  return { deps, calls };
}

describe("recheckSource", () => {
  it("runs the real check and audits success", async () => {
    const { deps, calls } = makeDeps();
    const r = await recheckSource(deps, ADMIN, SRC);
    expect(r.ok).toBe(true);
    expect(calls.check).toBe(1);
    expect(calls.audits).toHaveLength(1);
    expect(calls.audits[0]).toMatchObject({ adminId: ADMIN, action: "source_recheck", targetId: SRC, outcome: "success" });
  });
  it("audits a failed check without hiding it, and says existing data was kept", async () => {
    const { deps, calls } = makeDeps({ check: { ok: false, changed: false, updatesDetected: 0, duplicatesSkipped: 0, error: "HTTP 503" } });
    const r = await recheckSource(deps, ADMIN, SRC);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/kept/i);
    expect(calls.audits[0]?.outcome).toBe("failed");
    expect(calls.audits[0]?.details.error).toBe("HTTP 503");
  });
  it("refuses (and audits the refusal) for inactive, maintenance and just-checked sources, without fetching", async () => {
    for (const source of [{ enabled: false }, { needs_parser_maintenance: true }, { last_checked_at: "2026-10-17T05:59:00Z" }]) {
      const { deps, calls } = makeDeps({ source });
      const r = await recheckSource(deps, ADMIN, SRC);
      expect(r.ok).toBe(false);
      expect(calls.check).toBe(0);
      expect(calls.audits[0]?.outcome).toBe("refused");
    }
  });
  it("rejects a malformed id and an unknown source before doing anything", async () => {
    const a = makeDeps();
    expect((await recheckSource(a.deps, ADMIN, "not-a-uuid")).ok).toBe(false);
    expect(a.calls.audits).toHaveLength(0);
    const b = makeDeps({ source: null });
    expect((await recheckSource(b.deps, ADMIN, SRC)).message).toMatch(/not found/i);
    expect(b.calls.check).toBe(0);
  });
});

describe("setSourceEnabled", () => {
  it("turns a source off or on and audits it; nothing else is touched", async () => {
    const off = makeDeps();
    expect((await setSourceEnabled(off.deps, ADMIN, SRC, false)).ok).toBe(true);
    expect(off.calls.updates).toEqual([{ enabled: false }]);
    expect(off.calls.audits[0]?.action).toBe("source_disabled");
    const on = makeDeps({ source: { enabled: false } });
    await setSourceEnabled(on.deps, ADMIN, SRC, true);
    expect(on.calls.audits[0]?.action).toBe("source_enabled");
  });
  it("refuses a no-op change", async () => {
    const { deps, calls } = makeDeps();
    expect((await setSourceEnabled(deps, ADMIN, SRC, true)).ok).toBe(false);
    expect(calls.updates).toHaveLength(0);
    expect(calls.audits[0]?.outcome).toBe("refused");
  });
  it("reports a failed save as failed in the audit log", async () => {
    const { deps, calls } = makeDeps({ saveOk: false });
    expect((await setSourceEnabled(deps, ADMIN, SRC, false)).ok).toBe(false);
    expect(calls.audits[0]?.outcome).toBe("failed");
  });
});

describe("clearParserMaintenance", () => {
  it("clears the flag AND the stored hash so the fixed parser really re-runs", async () => {
    const { deps, calls } = makeDeps({ source: { needs_parser_maintenance: true } });
    const r = await clearParserMaintenance(deps, ADMIN, SRC);
    expect(r.ok).toBe(true);
    expect(calls.updates).toEqual([{ needs_parser_maintenance: false, last_content_hash: null, consecutive_failures: 0 }]);
    expect(calls.audits[0]?.action).toBe("source_maintenance_cleared");
  });
  it("refuses when the source is not flagged", async () => {
    const { deps, calls } = makeDeps();
    expect((await clearParserMaintenance(deps, ADMIN, SRC)).ok).toBe(false);
    expect(calls.updates).toHaveLength(0);
  });
});

describe("retryPublish", () => {
  it("re-applies a pending auto_publish update and audits it", async () => {
    const { deps, calls } = makeDeps();
    expect((await retryPublish(deps, ADMIN, UPD)).ok).toBe(true);
    expect(calls.apply).toBe(1);
    expect(calls.audits[0]).toMatchObject({ action: "update_publish_retried", outcome: "success", targetId: UPD });
  });
  it("NEVER publishes an uncertain or rejected update", async () => {
    for (const classification of ["needs_review", "reject"]) {
      const { deps, calls } = makeDeps({ update: { status: "pending", classification, detected_at: "2026-10-17T00:00:00Z" } });
      const r = await retryPublish(deps, ADMIN, UPD);
      expect(r.ok).toBe(false);
      expect(calls.apply).toBe(0);
      expect(calls.audits[0]?.outcome).toBe("refused");
    }
  });
  it("does not re-publish something already published", async () => {
    const { deps, calls } = makeDeps({ update: { status: "published", classification: "auto_publish", detected_at: "2026-10-17T00:00:00Z" } });
    expect((await retryPublish(deps, ADMIN, UPD)).ok).toBe(false);
    expect(calls.apply).toBe(0);
  });
  it("records a failing publish as failed", async () => {
    const { deps, calls } = makeDeps({ apply: { error: "cycle patch failed" } });
    expect((await retryPublish(deps, ADMIN, UPD)).ok).toBe(false);
    expect(calls.audits[0]?.outcome).toBe("failed");
  });
});

describe("retryFailedDeliveries", () => {
  it("requeues then retries, and audits the counts", async () => {
    const { deps, calls } = makeDeps({ requeued: 3 });
    const r = await retryFailedDeliveries(deps, ADMIN);
    expect(r.ok).toBe(true);
    expect(calls.retry).toBe(1);
    expect(calls.audits[0]).toMatchObject({ action: "deliveries_requeued", outcome: "success" });
  });
  it("does nothing (and says why) when no delivery can be retried", async () => {
    const { deps, calls } = makeDeps({ requeued: 0 });
    expect((await retryFailedDeliveries(deps, ADMIN)).ok).toBe(false);
    expect(calls.retry).toBe(0);
    expect(calls.audits[0]?.outcome).toBe("refused");
  });
});
