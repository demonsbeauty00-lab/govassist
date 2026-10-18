import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { absoluteLink, buildEmail, createEmailChannel, readEmailConfig } from "../channels/email";
import { createFakeStore } from "./fakes";
import { applyProviderEvent } from "../delivery";
import { parseResendEvent, verifySvixSignature } from "../webhook";

const msg = { notificationId: "n1", userId: "u1", title: "Admit card", body: "Your <b>admit card</b> is out", linkUrl: "/updates" };

describe("email channel", () => {
  it("is not configured without both an API key and a from address", () => {
    expect(readEmailConfig({})).toBeNull();
    expect(readEmailConfig({ RESEND_API_KEY: "k" })).toBeNull();
    expect(readEmailConfig({ RESEND_API_KEY: "k", EMAIL_FROM: "GovAssist <a@b.in>" })).not.toBeNull();
  });

  it("builds a safe email: escapes HTML and links only to our own site", () => {
    const e = buildEmail(msg, "https://govassist.app");
    expect(e.html).toContain("&lt;b&gt;");
    expect(e.html).not.toContain("<b>admit");
    expect(e.text).toContain("https://govassist.app/updates");
    expect(absoluteLink("https://evil.example", "https://govassist.app")).toBeNull();
    expect(absoluteLink("/updates", null)).toBeNull();
  });

  it("sends through the provider with an idempotency key and reports acceptance as ok", async () => {
    const seen: { headers: Record<string, string>; body: string } = { headers: {}, body: "" };
    const channel = createEmailChannel({
      config: { apiKey: "re_test", from: "GovAssist <a@b.in>", siteUrl: null },
      resolveEmail: async () => "user@example.com",
      fetchImpl: (async (_url: string, init: { headers: Record<string, string>; body: string }) => {
        seen.headers = init.headers;
        seen.body = init.body;
        return new Response(JSON.stringify({ id: "prov-1" }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const r = await channel.send(msg);
    expect(r).toEqual({ ok: true, providerMessageId: "prov-1" });
    expect(seen.headers["Idempotency-Key"]).toBe("govassist-notification-n1");
    expect(seen.body).toContain("user@example.com");
  });

  it("classifies provider errors: 4xx permanent, 429/5xx and network errors retryable, no address permanent", async () => {
    const mk = (status: number | "throw", email: string | null = "u@e.com") => createEmailChannel({
      config: { apiKey: "k", from: "f", siteUrl: null },
      resolveEmail: async () => email,
      fetchImpl: (async () => { if (status === "throw") throw new Error("down"); return new Response("{}", { status }); }) as unknown as typeof fetch,
    });
    expect(await mk(422).send(msg)).toMatchObject({ ok: false, permanent: true });
    expect(await mk(429).send(msg)).toMatchObject({ ok: false, permanent: false });
    expect(await mk(503).send(msg)).toMatchObject({ ok: false, permanent: false });
    expect(await mk("throw").send(msg)).toMatchObject({ ok: false, permanent: false });
    expect(await mk(200, null).send(msg)).toMatchObject({ ok: false, permanent: true });
  });

  it("only wants the channel for users who opted in", () => {
    const channel = createEmailChannel({ config: null, resolveEmail: async () => null });
    expect(channel.wantsChannel({ channel_email: true })).toBe(true);
    expect(channel.wantsChannel({})).toBe(false);
    expect(channel.wantsChannel(null)).toBe(false);
    expect(channel.isConfigured()).toBe(false);
  });
});

describe("provider webhook", () => {
  const secretBytes = Buffer.from("super-secret-key-bytes");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const NOW = 1_800_000_000;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "prov-1" } });

  it("accepts a correctly signed, fresh request (signature computed here, not by the real provider)", () => {
    expect(verifySvixSignature({ secret, id: "m1", timestamp: String(NOW), signatureHeader: sign("m1", String(NOW), body), body, nowSeconds: NOW })).toBe(true);
  });
  it("rejects a wrong signature, a tampered body, a stale timestamp and missing headers", () => {
    const good = sign("m1", String(NOW), body);
    expect(verifySvixSignature({ secret, id: "m1", timestamp: String(NOW), signatureHeader: "v1,AAAA", body, nowSeconds: NOW })).toBe(false);
    expect(verifySvixSignature({ secret, id: "m1", timestamp: String(NOW), signatureHeader: good, body: body + " ", nowSeconds: NOW })).toBe(false);
    expect(verifySvixSignature({ secret, id: "m1", timestamp: String(NOW - 3600), signatureHeader: sign("m1", String(NOW - 3600), body), body, nowSeconds: NOW })).toBe(false);
    expect(verifySvixSignature({ secret, id: null, timestamp: String(NOW), signatureHeader: good, body, nowSeconds: NOW })).toBe(false);
    expect(verifySvixSignature({ secret: "", id: "m1", timestamp: String(NOW), signatureHeader: good, body, nowSeconds: NOW })).toBe(false);
  });
  it("maps provider events: delivered, bounced/complained = failed, everything else ignored", () => {
    expect(parseResendEvent({ type: "email.delivered", data: { email_id: "p" } })).toEqual({ kind: "delivered", providerMessageId: "p" });
    expect(parseResendEvent({ type: "email.bounced", data: { email_id: "p" } })).toMatchObject({ kind: "failed" });
    expect(parseResendEvent({ type: "email.complained", data: { email_id: "p" } })).toMatchObject({ kind: "failed" });
    expect(parseResendEvent({ type: "email.sent", data: { email_id: "p" } })).toEqual({ kind: "ignore" });
    expect(parseResendEvent({ type: "email.delivered", data: {} })).toEqual({ kind: "ignore" });
    expect(parseResendEvent(null)).toEqual({ kind: "ignore" });
  });
});

describe("applyProviderEvent", () => {
  async function seeded() {
    const f = createFakeStore();
    await f.store.insertNotifications([{ user_id: "u1", title: "T", body: "B", type: "result", dedupe_key: "k", event_type: "RESULT_DECLARED", link_url: null, organization: null, source_url: null, published_on: null, stage_update_id: null }]);
    const d = await f.store.insertDelivery({ notificationId: "n1", userId: "u1", channel: "email", status: "pending" });
    await f.store.claimDelivery(d!.id, 0);
    await f.store.finishDelivery(d!.id, { status: "sent", providerMessageId: "prov-1", sentAt: "2026-10-01T00:00:00Z" });
    return f;
  }
  it("only a provider 'delivered' event moves sent -> delivered", async () => {
    const f = await seeded();
    expect(f.deliveries[0]?.status).toBe("sent");
    expect(await applyProviderEvent(f.store, { kind: "delivered", providerMessageId: "prov-1" }, new Date("2026-10-01T00:05:00Z"))).toBe(true);
    expect(f.deliveries[0]?.status).toBe("delivered");
    expect(f.deliveries[0]?.deliveredAt).toBe("2026-10-01T00:05:00.000Z");
  });
  it("a bounce marks the delivery failed with no retry", async () => {
    const f = await seeded();
    await applyProviderEvent(f.store, { kind: "failed", providerMessageId: "prov-1", reason: "bounced" });
    expect(f.deliveries[0]?.status).toBe("failed");
    expect(f.deliveries[0]?.nextAttemptAt).toBeNull();
  });
  it("an event for an unknown message changes nothing", async () => {
    const f = await seeded();
    expect(await applyProviderEvent(f.store, { kind: "delivered", providerMessageId: "other" })).toBe(false);
    expect(f.deliveries[0]?.status).toBe("sent");
  });
});
