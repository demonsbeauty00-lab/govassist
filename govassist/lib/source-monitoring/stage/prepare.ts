// Everything the checker decides about ONE parsed update, as a single pure-ish
// step (the only I/O is the injected `loadExisting` lookup): refine -> match
// cycle -> plan versioning -> classify -> validate.

import { classifyUpdate } from "../classify";
import { Classification, ParsedUpdate, UpdateType } from "../types";
import { enrichParsedUpdate } from "./enrich";
import { CycleCandidate, CycleMatchResult, CycleMatchVia, ExamCandidate, matchCycle } from "./match-cycle";
import { validateStageUpdate } from "./validate";
import { documentKeyFor, ExistingStageRow, isRevisionTitle, planVersioning, seriesKey, VersionPlan } from "./versioning";

export interface PreparedUpdate {
  update: ParsedUpdate;
  examCycleId: string | null;
  cycleMatch: CycleMatchVia | null;
  cycleReason: string;
  seriesKey: string;
  documentKey: string;
  isRevision: boolean;
  versionPlan: VersionPlan | null;
  /** The same document is already published for this cycle + stage. */
  duplicate: boolean;
  classification: Classification;
  reasons: string[];
}

export async function prepareDetectedUpdate(input: {
  parsed: ParsedUpdate;
  source: { examId: string | null; officialUrl: string };
  exams: ExamCandidate[];
  cycles: CycleCandidate[];
  loadExisting: (cycleId: string, type: UpdateType) => Promise<ExistingStageRow[]>;
}): Promise<PreparedUpdate> {
  const enriched = enrichParsedUpdate(input.parsed);
  const update = enriched.update;

  const match: CycleMatchResult = matchCycle({
    title: update.title,
    sourceExamId: input.source.examId,
    exams: input.exams,
    cycles: input.cycles,
  });

  const key = seriesKey(update.title, update.updateType);
  const docKey = documentKeyFor(update.documentUrl, input.source.officialUrl, update.title);
  const revision = isRevisionTitle(update.title);

  let versionPlan: VersionPlan | null = null;
  if (match.cycleId && update.updateType !== "new_notification") {
    const existing = await input.loadExisting(match.cycleId, update.updateType);
    versionPlan = planVersioning({
      seriesKey: key,
      documentKey: docKey,
      publicationDate: update.publicationDate,
      isRevision: revision,
      existing,
    });
  }

  const validation = validateStageUpdate({
    update,
    baseClassification: classifyUpdate(update),
    sourceUrl: input.source.officialUrl,
    cycleMatched: match.cycleId !== null,
    typeAmbiguous: enriched.typeAmbiguous,
    dateAmbiguous: enriched.dateAmbiguous,
    versionAction: versionPlan?.action ?? null,
  });

  return {
    update,
    examCycleId: match.cycleId,
    cycleMatch: match.via,
    cycleReason: match.reason,
    seriesKey: key,
    documentKey: docKey,
    isRevision: revision,
    versionPlan,
    duplicate: versionPlan?.action === "duplicate",
    classification: validation.classification,
    reasons: validation.reasons,
  };
}
