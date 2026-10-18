import { describe, it, expect } from "vitest";
import { loadOptionsForQuestions, chunk, OptionsReader, QuestionOptionRow } from "../load-options";

const row = (id: string, q: string): QuestionOptionRow => ({ id, question_id: q } as QuestionOptionRow);

describe("loadOptionsForQuestions", () => {
  it("chunks ids so no request is oversized and returns every row", async () => {
    const calls: number[] = [];
    const reader: OptionsReader = {
      fetchBatch: async (ids) => {
        calls.push(ids.length);
        return { data: ids.map((q) => row(`o-${q}`, q)), error: null };
      },
    };
    const ids = Array.from({ length: 250 }, (_, i) => `q${i}`);
    const rows = await loadOptionsForQuestions(reader, ids);
    expect(rows).toHaveLength(250);
    expect(calls).toEqual([100, 100, 50]);
  });
  it("de-duplicates ids", async () => {
    let seen = 0;
    const reader: OptionsReader = { fetchBatch: async (ids) => { seen = ids.length; return { data: [], error: null }; } };
    await loadOptionsForQuestions(reader, ["a", "a", "b"]);
    expect(seen).toBe(2);
  });
  it("fails loudly instead of returning a partial list", async () => {
    const reader: OptionsReader = { fetchBatch: async () => ({ data: null, error: { message: "boom" } }) };
    await expect(loadOptionsForQuestions(reader, ["a"])).rejects.toThrow("boom");
  });
  it("makes no request for no questions", async () => {
    let calls = 0;
    const reader: OptionsReader = { fetchBatch: async () => { calls++; return { data: [], error: null }; } };
    expect(await loadOptionsForQuestions(reader, [])).toEqual([]);
    expect(calls).toBe(0);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});
