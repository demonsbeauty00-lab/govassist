import { describe, it, expect } from "vitest";
import { createRequestSchema, adminUpdateSchema, examKeyFor, userReplySchema } from "../schema";
import { canAdminTransition, validateAdminTransition, canUserCancel, canUserReply, allowedAdminTargets } from "../transitions";
import { bytesMatchMime, validateUploadMeta, safeFileName } from "../file-validation";
import { MAX_FILE_BYTES, REQUEST_STATUSES } from "../constants";

const VALID = {
  examSlug: "ssc-cgl-2026", assistanceType: "full_application", applicantName: "Asha Verma",
  applicantPhone: "9876543210", consent: true,
};

describe("createRequestSchema", () => {
  it("accepts a valid request", () => {
    expect(createRequestSchema.safeParse(VALID).success).toBe(true);
  });
  it("rejects when consent is not given", () => {
    expect(createRequestSchema.safeParse({ ...VALID, consent: false }).success).toBe(false);
  });
  it("rejects bad phone numbers", () => {
    expect(createRequestSchema.safeParse({ ...VALID, applicantPhone: "12345" }).success).toBe(false);
  });
  it("requires an exam or a custom title", () => {
    expect(createRequestSchema.safeParse({ ...VALID, examSlug: "" }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, examSlug: "", customExamTitle: "State Police SI 2026" }).success).toBe(true);
  });
  it("rejects unknown assistance types and non-http links", () => {
    expect(createRequestSchema.safeParse({ ...VALID, assistanceType: "hack" }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, notificationUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("rejects over-long details", () => {
    expect(createRequestSchema.safeParse({ ...VALID, details: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("examKeyFor", () => {
  it("normalises custom titles so trivial variants collide", () => {
    expect(examKeyFor(null, "State Police  SI 2026!")).toBe(examKeyFor(null, "state police si 2026"));
    expect(examKeyFor("a", "x")).toBe("slug:a");
  });
});

describe("status transitions", () => {
  it("allows the expected forward path", () => {
    expect(canAdminTransition("submitted", "under_review")).toBe(true);
    expect(canAdminTransition("under_review", "in_progress")).toBe(true);
    expect(canAdminTransition("in_progress", "completed")).toBe(true);
  });
  it("blocks skipping straight to completed and leaving terminal states", () => {
    expect(canAdminTransition("submitted", "completed")).toBe(false);
    for (const t of ["completed", "rejected", "cancelled"] as const) {
      expect(allowedAdminTargets(t)).toHaveLength(0);
    }
  });
  it("never lists a status as a target of itself", () => {
    for (const s of REQUEST_STATUSES) expect(canAdminTransition(s, s)).toBe(false);
  });
  it("requires a message for waiting_for_user and rejected", () => {
    const base = { from: "under_review" as const, officialReferenceNumber: null, hasConfirmationDocument: false };
    expect(validateAdminTransition({ ...base, to: "waiting_for_user", message: " " })).not.toBeNull();
    expect(validateAdminTransition({ ...base, to: "waiting_for_user", message: "Need photo" })).toBeNull();
    expect(validateAdminTransition({ ...base, to: "rejected", message: null })).not.toBeNull();
  });
  it("only allows completed with a reference number or confirmation document", () => {
    const base = { from: "in_progress" as const, to: "completed" as const, message: null };
    expect(validateAdminTransition({ ...base, officialReferenceNumber: null, hasConfirmationDocument: false })).not.toBeNull();
    expect(validateAdminTransition({ ...base, officialReferenceNumber: "REF123", hasConfirmationDocument: false })).toBeNull();
    expect(validateAdminTransition({ ...base, officialReferenceNumber: null, hasConfirmationDocument: true })).toBeNull();
  });
  it("limits what users can do", () => {
    expect(canUserCancel("submitted")).toBe(true);
    expect(canUserCancel("in_progress")).toBe(false);
    expect(canUserCancel("completed")).toBe(false);
    expect(canUserReply("waiting_for_user")).toBe(true);
    expect(canUserReply("submitted")).toBe(false);
  });
});

describe("admin/user input schemas", () => {
  it("rejects invalid status and non-uuid ids", () => {
    expect(adminUpdateSchema.safeParse({ requestId: "nope", toStatus: "completed" }).success).toBe(false);
    expect(adminUpdateSchema.safeParse({ requestId: "5f0c2d8e-6b3a-4c1e-9d6a-1a2b3c4d5e6f", toStatus: "hacked" }).success).toBe(false);
  });
  it("requires a non-empty reply", () => {
    expect(userReplySchema.safeParse({ requestId: "5f0c2d8e-6b3a-4c1e-9d6a-1a2b3c4d5e6f", message: "  " }).success).toBe(false);
  });
});

describe("file validation", () => {
  it("checks size and type", () => {
    expect("error" in validateUploadMeta(MAX_FILE_BYTES + 1, "application/pdf")).toBe(true);
    expect("error" in validateUploadMeta(10, "application/zip")).toBe(true);
    expect("mime" in validateUploadMeta(10, "image/jpg")).toBe(true);
  });
  it("matches magic bytes to the claimed type", () => {
    expect(bytesMatchMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf")).toBe(true);
    expect(bytesMatchMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "application/pdf")).toBe(false);
    expect(bytesMatchMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(bytesMatchMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png")).toBe(true);
    expect(bytesMatchMime(new Uint8Array([]), "image/png")).toBe(false);
  });
  it("sanitises file names", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
  });
});

import { isOwner, isVisibleToApplicant, isAdminUser } from "../authz";

describe("authorization predicates", () => {
  it("only the owner passes the ownership check", () => {
    expect(isOwner({ user_id: "u1" }, "u1")).toBe(true);
    expect(isOwner({ user_id: "u1" }, "u2")).toBe(false);
    expect(isOwner(null, "u1")).toBe(false);
    expect(isOwner(undefined, "u1")).toBe(false);
  });
  it("hides internal events from applicants", () => {
    expect(isVisibleToApplicant({ visibility: "internal" })).toBe(false);
    expect(isVisibleToApplicant({ visibility: "user" })).toBe(true);
  });
  it("recognises admins only if listed", () => {
    expect(isAdminUser(["a1"], "a1")).toBe(true);
    expect(isAdminUser(["a1"], "u1")).toBe(false);
    expect(isAdminUser([], "u1")).toBe(false);
  });
});

import { whatsappLink, smsLink, telLink, ASSIST_PHONE_E164 } from "../contact";

describe("assistance contact links", () => {
  it("uses the configured number and includes the request code", () => {
    expect(ASSIST_PHONE_E164).toBe("917017453851");
    expect(whatsappLink("AR-1", "SSC CGL")).toContain("https://wa.me/917017453851?text=");
    expect(decodeURIComponent(whatsappLink("AR-1", "SSC CGL"))).toContain("AR-1");
    expect(smsLink("AR-1")).toContain("sms:+917017453851");
    expect(telLink()).toBe("tel:+917017453851");
  });
});
