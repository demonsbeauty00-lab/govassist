import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAndHash } from "../fetch";

describe("fetchAndHash", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok: true with a content hash on a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "<html>Notice</html>" }) as Response)
    );

    const result = await fetchAndHash("https://example.gov.in/notices");
    expect(result.ok).toBe(true);
    expect(result.content).toBe("<html>Notice</html>");
    expect(result.contentHash).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("fails safely (ok: false, no thrown error) on a non-200 response — a temporarily unavailable site", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "" }) as Response)
    );

    const result = await fetchAndHash("https://example.gov.in/notices");
    expect(result.ok).toBe(false);
    expect(result.content).toBeNull();
    expect(result.error).toContain("503");
  });

  it("fails safely on a network error rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND example.gov.in");
      })
    );

    const result = await fetchAndHash("https://example.gov.in/notices");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOTFOUND");
  });

  it("handles an empty/malformed response body without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "" }) as Response)
    );

    const result = await fetchAndHash("https://example.gov.in/notices");
    expect(result.ok).toBe(true);
    expect(result.content).toBe("");
    expect(result.contentHash).toBeTruthy();
  });
});
