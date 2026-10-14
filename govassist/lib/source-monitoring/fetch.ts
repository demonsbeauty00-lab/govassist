import "server-only";
import { createHash } from "crypto";
import { FetchResult } from "./types";

const FETCH_TIMEOUT_MS = 15_000;

/** Normalizes whitespace before hashing so a change detector doesn't fire
 *  on a page whose only "change" is incidental whitespace/formatting drift
 *  from the server — requirement 3 asks us not to create noise, only to
 *  detect real changes. */
function normalizeForHashing(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export function hashContent(content: string): string {
  return createHash("sha256").update(normalizeForHashing(content)).digest("hex");
}

/**
 * Fetches an official source URL and hashes its content. Never throws —
 * every failure mode (timeout, non-200, network error) comes back as a
 * FetchResult with ok: false and a human-readable error, because the
 * checker's job on a failed fetch is to record the failure and retry
 * later (requirement 16), never to crash the scheduled run or delete
 * existing data.
 */
export async function fetchAndHash(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Identifies the request honestly rather than spoofing a browser —
        // an official site is free to rate-limit or block this, and the
        // checker must fail safely (see requirement 16) if it does, not
        // work around it.
        "User-Agent": "GovAssistSourceChecker/1.0 (+https://govassist.app/about-monitoring)",
      },
    });

    if (!response.ok) {
      return { ok: false, content: null, contentHash: null, error: `HTTP ${response.status}` };
    }

    const content = await response.text();
    return { ok: true, content, contentHash: hashContent(content), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return { ok: false, content: null, contentHash: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
