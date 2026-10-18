// Resend webhooks are signed with Svix. Verifies the signature and maps the
// event to a delivery status. Only a verified "email.delivered" may mark a
// delivery "delivered".

import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(params: {
  secret: string; id: string | null; timestamp: string | null; signatureHeader: string | null; body: string; nowSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signatureHeader, body } = params;
  if (!secret || !id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false; // replay protection

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export type WebhookOutcome =
  | { kind: "delivered"; providerMessageId: string }
  | { kind: "failed"; providerMessageId: string; reason: string }
  | { kind: "ignore" };

export function parseResendEvent(payload: unknown): WebhookOutcome {
  if (typeof payload !== "object" || payload === null) return { kind: "ignore" };
  const { type, data } = payload as { type?: unknown; data?: { email_id?: unknown } };
  const emailId = typeof data?.email_id === "string" ? data.email_id : null;
  if (typeof type !== "string" || !emailId) return { kind: "ignore" };
  if (type === "email.delivered") return { kind: "delivered", providerMessageId: emailId };
  if (type === "email.bounced") return { kind: "failed", providerMessageId: emailId, reason: "bounced" };
  if (type === "email.complained") return { kind: "failed", providerMessageId: emailId, reason: "marked as spam" };
  return { kind: "ignore" }; // sent / delivery_delayed / opened / clicked: not a state change we record
}
