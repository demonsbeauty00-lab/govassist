// Email channel via the Resend HTTP API (no new dependency: plain fetch).
// Only active when RESEND_API_KEY and EMAIL_FROM are set AND the user opted in.
// "ok" here means the PROVIDER ACCEPTED the message (status "sent"); actual
// delivery is confirmed separately by the provider webhook.

import { isEmailChannelEnabled } from "../../preferences";
import { isSafeInternalLink } from "../../events";
import type { Channel, OutboundMessage, SendResult } from "../types";

export interface EmailConfig { apiKey: string; from: string; siteUrl: string | null }

export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || null;
  return { apiKey, from, siteUrl };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Absolute link only when we know our own origin; never an external URL. */
export function absoluteLink(linkUrl: string | null, siteUrl: string | null): string | null {
  if (!siteUrl || !isSafeInternalLink(linkUrl)) return null;
  return `${siteUrl}${linkUrl}`;
}

export function buildEmail(message: OutboundMessage, siteUrl: string | null): { subject: string; text: string; html: string } {
  const link = absoluteLink(message.linkUrl, siteUrl);
  const text = `${message.body}${link ? `\n\nOpen in GovAssist: ${link}` : ""}\n\nYou can turn email alerts off in GovAssist Settings.`;
  const html =
    `<p>${escapeHtml(message.body)}</p>` +
    (link ? `<p><a href="${escapeHtml(link)}">Open in GovAssist</a></p>` : "") +
    `<p style="color:#666;font-size:12px">You can turn email alerts off in GovAssist Settings.</p>`;
  return { subject: message.title, text, html };
}

export function createEmailChannel(deps: {
  config: EmailConfig | null;
  resolveEmail: (userId: string) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): Channel {
  const doFetch = deps.fetchImpl ?? fetch;
  return {
    name: "email",
    isConfigured: () => deps.config !== null,
    wantsChannel: (prefs) => isEmailChannelEnabled(prefs),
    async send(message): Promise<SendResult> {
      const config = deps.config;
      if (!config) return { ok: false, error: "email provider not configured", permanent: false };
      const to = await deps.resolveEmail(message.userId);
      if (!to) return { ok: false, error: "no email address on file", permanent: true };
      const { subject, text, html } = buildEmail(message, config.siteUrl);
      let res: Response;
      try {
        res = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            // Provider-side idempotency: a retry of the same notification can't double-send.
            "Idempotency-Key": `govassist-notification-${message.notificationId}`,
          },
          body: JSON.stringify({ from: config.from, to: [to], subject, text, html }),
        });
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "network error", permanent: false };
      }
      if (res.ok) {
        let id: string | null = null;
        try {
          const json = (await res.json()) as { id?: unknown };
          id = typeof json.id === "string" ? json.id : null;
        } catch { /* accepted without a parsable id */ }
        return { ok: true, providerMessageId: id };
      }
      // 4xx (except 408/429) = the provider rejected it; retrying will not help.
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
      return { ok: false, error: `provider responded ${res.status}`, permanent };
    },
  };
}
