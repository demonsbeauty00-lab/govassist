import { describe, it, expect } from "vitest";
import { hashContent } from "../fetch";

describe("hashContent", () => {
  it("produces the same hash for identical content", () => {
    const a = hashContent("<html><body>Notice: SSC CGL 2026 released</body></html>");
    const b = hashContent("<html><body>Notice: SSC CGL 2026 released</body></html>");
    expect(a).toBe(b);
  });

  it("produces different hashes for genuinely different content — the basis of change detection", () => {
    const a = hashContent("<html><body>Notice: SSC CGL 2026 released</body></html>");
    const b = hashContent("<html><body>Notice: SSC CGL 2027 released</body></html>");
    expect(a).not.toBe(b);
  });

  it("is insensitive to incidental whitespace/formatting drift, not just exact byte matches", () => {
    const a = hashContent("<html>\n  <body>Notice released</body>\n</html>");
    const b = hashContent("<html><body>   Notice   released   </body></html>");
    expect(a).toBe(b);
  });

  it("still detects a real change even when whitespace also differs", () => {
    const a = hashContent("<html>\n  <body>Notice released</body>\n</html>");
    const b = hashContent("<html><body>Notice   withdrawn</body></html>");
    expect(a).not.toBe(b);
  });
});
