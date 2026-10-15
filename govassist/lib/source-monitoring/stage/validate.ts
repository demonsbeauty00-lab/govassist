// Validation after classification. Starts from the existing classifyUpdate()
// result and can only make it STRICTER (auto_publish -> needs_review). It never
// upgrades a needs_review or reject.

import { Classification, ParsedUpdate } from "../types";
import { VersionAction } from "./versioning";

/** True when the link is on the source's own site or an official Indian
 *  government/academic domain. Off-site links are not rejected, only reviewed. */
export function isOfficialLink(link: string | null, sourceUrl: string): boolean {
  if (!link) return true; // nothing to check; the page itself is the source
  try {
    const host = new URL(link).hostname.toLowerCase();
    const sourceHost = new URL(sourceUrl).hostname.toLowerCase();
    if (host === sourceHost) return true;
    const reg = (h: string) => h.split(".").slice(-3).join(".");
    if (host.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${host}`)) return true;
    if (reg(host) === reg(sourceHost) && reg(host).split(".").length === 3 && /\.(gov|nic|ac|org)\.in$/.test(reg(host))) return true;
    return /\.(gov\.in|nic\.in|ac\.in)$/.test(host);
  } catch {
    return false;
  }
}

export interface StageValidationInput {
  update: ParsedUpdate;
  baseClassification: Classification;
  sourceUrl: string;
  cycleMatched: boolean;
  typeAmbiguous: boolean;
  dateAmbiguous: boolean;
  versionAction: VersionAction | null;
}

export interface StageValidation {
  classification: Classification;
  reasons: string[];
}

export function validateStageUpdate(i: StageValidationInput): StageValidation {
  if (i.baseClassification === "reject") return { classification: "reject", reasons: [] };

  const reasons: string[] = [];
  const type = i.update.updateType;

  if (type !== "new_notification" && !i.cycleMatched) reasons.push("The exam cycle could not be identified with confidence.");
  if (i.typeAmbiguous) reasons.push("The title matches more than one stage (for example answer key and result).");
  if (i.dateAmbiguous) reasons.push("The title contains dates that could not be read as one date or one range.");
  if (type === "exam_date" && !i.update.eventDate) reasons.push("The exam date is not stated explicitly in the title.");
  if (type === "cutoff" && !i.update.extractedFields.some((f) => f.label === "Cutoff" && f.confidence === "high")) {
    reasons.push("The cut-off value was not extracted with high confidence.");
  }
  if (i.versionAction === "ambiguous") reasons.push("A document of the same series is already published; it is unclear whether this replaces it.");
  if (!isOfficialLink(i.update.documentUrl, i.sourceUrl)) reasons.push("The document link is not on the source's own site or an official domain.");

  if (reasons.length === 0) return { classification: i.baseClassification, reasons };
  return { classification: "needs_review", reasons };
}
