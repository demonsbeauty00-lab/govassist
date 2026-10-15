import type { ApplicantProfile, EligibilityRules } from "./types";

// Deterministic change-detection hashes (NOT security hashes). They let the
// re-evaluation code skip work when neither the profile nor the official
// rules changed since the stored result was computed.

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** FNV-1a 32-bit, hex. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function rulesFingerprint(rules: EligibilityRules, corrigendumPending: boolean): string {
  return fnv1a(stableStringify({ rules, corrigendumPending }));
}

export function profileFingerprint(profile: ApplicantProfile): string {
  const qualifications = [...profile.qualifications].sort((a, b) =>
    stableStringify(a).localeCompare(stableStringify(b)));
  return fnv1a(stableStringify({ ...profile, qualifications }));
}
