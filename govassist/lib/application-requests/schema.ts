import { z } from "zod";
import { ASSISTANCE_TYPES, REQUEST_STATUSES } from "./constants";

/** Today's date in India (UTC+5:30) as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
/** True when a YYYY-MM-DD date is before today in India. */
export function isPastDateIST(date: string, now: Date = new Date()): boolean {
  return date < todayIST(now);
}

const httpUrl = (message: string) =>
  z.string().trim().max(500).optional().transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), message);

const text = (max: number) => z.string().trim().max(max);

/** Collapses a free-text exam title into a stable duplicate-detection key. */
export function examKeyFor(slug: string | null, title: string): string {
  return slug ? `slug:${slug}` : `title:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

export const createRequestSchema = z
  .object({
    examSlug: text(100).optional().transform((v) => (v ? v : null)),
    customExamTitle: text(200).optional().transform((v) => (v ? v : null)),
    notificationUrl: text(500)
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "Enter a valid link starting with http:// or https://."),
    applicationDeadline: text(10)
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Enter a valid deadline date.")
      .refine((v) => v === null || !isPastDateIST(v), "That last date has already passed. Check the official notice for the correct date."),
    officialApplicationUrl: httpUrl("Enter a valid link starting with http:// or https://."),
    cycleLabel: text(120).optional().transform((v) => (v ? v : null)),
    examCycleId: z.string().uuid().optional().or(z.literal("")).transform((v) => (v ? v : null)),
    vaultDocumentIds: z.array(z.string().uuid()).max(4, "Choose at most 4 saved documents.").default([]),
    postApplied: text(200).optional().transform((v) => (v ? v : null)),
    assistanceType: z.enum(ASSISTANCE_TYPES, { errorMap: () => ({ message: "Choose the assistance you need." }) }),
    applicantName: text(120).min(1, "Enter your full name as on your documents."),
    applicantPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
    details: text(2000).optional().transform((v) => (v ? v : null)),
    consent: z.literal(true, { errorMap: () => ({ message: "You must accept the consent statement to submit." }) }),
  })
  .refine((v) => v.examSlug !== null || v.customExamTitle !== null || v.examCycleId !== null, {
    message: "Choose an exam or enter the exam/notification name.",
    path: ["examSlug"],
  });
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const adminUpdateSchema = z.object({
  requestId: z.string().uuid(),
  toStatus: z.enum(REQUEST_STATUSES),
  message: text(2000).optional().transform((v) => (v ? v : null)),
  officialReferenceNumber: text(100).optional().transform((v) => (v ? v : null)),
});

export const userReplySchema = z.object({
  requestId: z.string().uuid(),
  message: text(2000).min(1, "Write your reply first."),
});

export const internalNoteSchema = z.object({
  requestId: z.string().uuid(),
  note: text(2000).min(1, "Write a note first."),
});

export const adminListFilterSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  /** Phase 15: "overdue" = still open although the applicant's last date has passed. */
  queue: z.enum(["overdue"]).optional(),
  q: text(100).optional(),
});

export const claimSchema = z.object({ requestId: z.string().uuid(), takeOver: z.boolean().optional() });

export const requestChangesSchema = z.object({
  requestId: z.string().uuid(),
  message: text(2000).min(1, "Tell the admin what needs to change."),
});

export const actionDoneSchema = z.object({
  requestId: z.string().uuid(),
  message: text(2000).optional().transform((v) => (v ? v : null)),
  /** Number the applicant SAW on the portal. Reported, never treated as verified. */
  reportedReference: text(100).optional().transform((v) => (v ? v : null)),
});

/** Stages an admin may record by hand (an official notice the monitoring
 *  pipeline hasn't picked up). "submitted" is only set through the
 *  submitted_on_portal status, which demands confirmation. */
export const MANUAL_OFFICIAL_STAGES = ["admit_card", "exam_completed", "answer_key", "result"] as const;
export const officialStageSchema = z.object({
  requestId: z.string().uuid(),
  stage: z.enum(MANUAL_OFFICIAL_STAGES),
  message: text(2000).optional().transform((v) => (v ? v : null)),
});

export const linkCycleSchema = z.object({ requestId: z.string().uuid(), examCycleId: z.string().uuid() });
