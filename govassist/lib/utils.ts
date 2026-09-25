import { ApplicationWindowStatus } from "./types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

// Eligibility category labels now live in lib/eligibility/types.ts
// (RESULT_CATEGORY_LABEL) — eligibility is a live engine result, not a
// static field, so its label map belongs next to the engine that produces it.

export const applicationWindowLabel: Record<ApplicationWindowStatus, string> = {
  opening_soon: "Opening soon",
  open: "Open",
  closing_soon: "Closing soon",
  closed: "Closed",
};

export function getAge(dobIso: string): number {
  const dob = new Date(dobIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
