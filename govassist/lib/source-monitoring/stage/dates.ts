// ---------------------------------------------------------------------------
// Explicit-date extraction. Only a FULL calendar date written out in the text
// counts (dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy, "12 March 2026", "March 12,
// 2026"). Partial dates ("in March"), two-digit years and impossible dates are
// ignored — never completed or guessed. Indian order (day first) is used for
// numeric dates, as official notices do.
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function toIso(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const NUMERIC = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/g;
const DAY_MONTH_YEAR = /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})(?!\d)/g;
const MONTH_DAY_YEAR = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/g;

/** All distinct, valid, explicit dates in the text, sorted ascending. */
export function extractExplicitDates(text: string): string[] {
  const found = new Set<string>();

  for (const m of Array.from(text.matchAll(NUMERIC))) {
    const iso = toIso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (iso) found.add(iso);
  }
  for (const m of Array.from(text.matchAll(DAY_MONTH_YEAR))) {
    const month = MONTHS[(m[2] ?? "").toLowerCase()];
    if (!month) continue;
    const iso = toIso(Number(m[3]), month, Number(m[1]));
    if (iso) found.add(iso);
  }
  for (const m of Array.from(text.matchAll(MONTH_DAY_YEAR))) {
    const month = MONTHS[(m[1] ?? "").toLowerCase()];
    if (!month) continue;
    const iso = toIso(Number(m[3]), month, Number(m[2]));
    if (iso) found.add(iso);
  }
  return Array.from(found).sort();
}

export interface DateRangeResult {
  start: string | null;
  end: string | null;
  /** Dates were present but could not be read as one date or one clear range. */
  ambiguous: boolean;
}

/** One date -> a single day. Two dates joined by "to/till/-/and" -> a range.
 *  Anything else (3+ dates, two unrelated dates) -> ambiguous, nothing returned. */
export function extractDateRange(text: string): DateRangeResult {
  const dates = extractExplicitDates(text);
  if (dates.length === 0) return { start: null, end: null, ambiguous: false };
  if (dates.length === 1) return { start: dates[0] ?? null, end: null, ambiguous: false };
  if (dates.length === 2 && /\b(to|till|until|through|and)\b|–|—|\s-\s/i.test(text)) {
    return { start: dates[0] ?? null, end: dates[1] ?? null, ambiguous: false };
  }
  return { start: null, end: null, ambiguous: true };
}
