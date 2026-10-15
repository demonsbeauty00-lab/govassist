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

  it("keeps the space between words, so different wording is still a different hash", () => {
    expect(hashContent("<p>Notice released</p>")).not.toBe(hashContent("<p>Noticereleased</p>"));
    expect(hashContent("<p>Admit card released</p>")).not.toBe(hashContent("<p>Admit cardreleased</p>"));
  });

  it("ignores indentation, tabs and CRLF line breaks around tags", () => {
    const a = hashContent("<ul>\r\n\t<li>Admit Card</li>\r\n\t<li>Result</li>\r\n</ul>");
    const b = hashContent("<ul><li>Admit Card</li><li>Result</li></ul>");
    expect(a).toBe(b);
  });

  it("still detects a changed word inside the page", () => {
    const a = hashContent("<ul>\n  <li>Admit Card</li>\n</ul>");
    const b = hashContent("<ul><li>Answer Key</li></ul>");
    expect(a).not.toBe(b);
  });
});
