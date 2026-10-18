import { describe, it, expect } from "vitest";
import { decideAdminAccess, NO_ADMIN_ACCESS_MESSAGE } from "../admin-decision";

describe("decideAdminAccess (fails closed)", () => {
  it("allows only a confirmed admins row that belongs to the caller", () => {
    expect(decideAdminAccess({ userId: "u1", adminRow: { user_id: "u1" } })).toEqual({ ok: true, userId: "u1" });
  });
  it("denies when there is no admins row", () => {
    expect(decideAdminAccess({ userId: "u1", adminRow: null })).toEqual({ ok: false, error: NO_ADMIN_ACCESS_MESSAGE });
    expect(decideAdminAccess({ userId: "u1", adminRow: undefined }).ok).toBe(false);
  });
  it("denies when the lookup itself failed", () => {
    expect(decideAdminAccess({ userId: "u1", adminRow: { user_id: "u1" }, lookupFailed: true }).ok).toBe(false);
  });
  it("denies a row that belongs to someone else, and a missing user", () => {
    expect(decideAdminAccess({ userId: "u1", adminRow: { user_id: "u2" } }).ok).toBe(false);
    expect(decideAdminAccess({ userId: null, adminRow: { user_id: "u1" } }).ok).toBe(false);
  });
});
