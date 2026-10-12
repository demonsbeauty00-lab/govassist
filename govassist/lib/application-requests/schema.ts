import { z } from "zod";
import { ASSISTANCE_TYPES, REQUEST_STATUSES } from "./constants";

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
      .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Enter a valid deadline date."),
    postApplied: text(200).optional().transform((v) => (v ? v : null)),
    assistanceType: z.enum(ASSISTANCE_TYPES, { errorMap: () => ({ message: "Choose the assistance you need." }) }),
    applicantName: text(120).min(1, "Enter your full name as on your documents."),
    applicantPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
    details: text(2000).optional().transform((v) => (v ? v : null)),
    consent: z.literal(true, { errorMap: () => ({ message: "You must accept the consent statement to submit." }) }),
  })
  .refine((v) => v.examSlug !== null || v.customExamTitle !== null, {
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
  q: text(100).optional(),
});
