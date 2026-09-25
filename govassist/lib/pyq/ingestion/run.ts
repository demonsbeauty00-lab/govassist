import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDocument } from "./hash";
import { getPaperParser } from "./parsers/registry";
import { classifyPaper, classifyQuestion } from "./classify";
import { detectDuplicates } from "./dedupe";
import { IngestionOutcome } from "./types";

export interface IngestPaperInput {
  /** Which registered source this came from, or null for an admin-triggered
   *  manual/ad-hoc import. */
  sourceId: string | null;
  documentUrl: string;
  rawContent: string;
  organization: string;
  parserVersion: string;
}

/**
 * Ingests one paper document end-to-end:
 *   fetch (caller's job — this takes already-fetched content)
 *   → hash → duplicate check (whole document, then per-question)
 *   → parse → classify → insert (papers/sections/marking_schemes/
 *     questions/question_options) → audit log.
 *
 * Never throws — every failure path is recorded on the run row and in the
 * audit log (same "fail safely" principle as
 * lib/source-monitoring/checker.ts), never a thrown error that could take
 * down a scheduled cron sweep partway through.
 */
export async function ingestPaper(input: IngestPaperInput): Promise<IngestionOutcome> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const contentHash = hashDocument(input.rawContent);

  const { data: run, error: runInsertError } = await supabase
    .from("paper_ingestion_runs")
    .insert({
      source_id: input.sourceId,
      document_url: input.documentUrl,
      content_hash: contentHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (runInsertError || !run) {
    // A unique-constraint hit here (source_id, content_hash) means this
    // exact document was already ingested from this source before —
    // routine, not an error (mirrors checker.ts's duplicate handling).
    if (runInsertError?.code === "23505") {
      return { ok: true, duplicate: true, paperId: null, classification: null, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: null };
    }
    return { ok: false, duplicate: false, paperId: null, classification: null, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: runInsertError?.message ?? "Could not create ingestion run." };
  }

  // Whole-document duplicate check against already-published/ingested
  // papers, independent of the source-scoped unique index above (a manual
  // admin re-paste has no source_id to dedupe against via that index).
  const { data: existingPaper } = await supabase.from("papers").select("id").eq("content_hash", contentHash).maybeSingle();
  if (existingPaper) {
    await supabase.from("paper_ingestion_runs").update({ status: "rejected", error_message: "Duplicate document — already ingested.", completed_at: now }).eq("id", run.id);
    await supabase.from("paper_ingestion_audit_log").insert({ run_id: run.id, paper_id: existingPaper.id, event_type: "duplicate_skipped", notes: "Whole-document content hash matched an existing paper." });
    return { ok: true, duplicate: true, paperId: existingPaper.id, classification: null, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: null };
  }

  const parser = getPaperParser(input.parserVersion);
  if (!parser) {
    await supabase.from("paper_ingestion_runs").update({ status: "failed", error_message: `No parser registered for version "${input.parserVersion}"`, completed_at: now }).eq("id", run.id);
    if (input.sourceId) {
      await supabase.from("paper_ingestion_sources").update({ needs_parser_maintenance: true, last_error: "No parser registered.", updated_at: now }).eq("id", input.sourceId);
    }
    return { ok: false, duplicate: false, paperId: null, classification: null, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: "No parser registered." };
  }

  let parsed;
  try {
    parsed = parser.parse(input.rawContent, { documentUrl: input.documentUrl, organization: input.organization });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parser threw an unknown error";
    await supabase.from("paper_ingestion_runs").update({ status: "failed", error_message: `Parser error: ${message}`, completed_at: now }).eq("id", run.id);
    return { ok: false, duplicate: false, paperId: null, classification: null, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: message };
  }

  if (!parsed) {
    await supabase.from("paper_ingestion_runs").update({ status: "failed", error_message: "Parser could not extract a paper from this content — see the parser's own validation.", completed_at: now }).eq("id", run.id);
    return { ok: false, duplicate: false, paperId: null, classification: null, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: "Nothing usable extracted." };
  }

  await supabase.from("paper_ingestion_audit_log").insert({ run_id: run.id, event_type: "extracted", new_value: { questionCount: parsed.questions.length, confidence: parsed.confidence } });

  const classification = classifyPaper(parsed);
  await supabase.from("paper_ingestion_audit_log").insert({ run_id: run.id, event_type: "classified", new_value: { classification } });

  if (classification === "reject") {
    await supabase.from("paper_ingestion_runs").update({ status: "rejected", classification, extracted_question_count: parsed.questions.length, extraction_confidence: parsed.confidence, completed_at: now }).eq("id", run.id);
    await supabase.from("paper_ingestion_audit_log").insert({ run_id: run.id, event_type: "rejected", notes: "Paper-level classification was REJECT — too few usable questions or confidence too low." });
    return { ok: true, duplicate: false, paperId: null, classification, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: null };
  }

  const paperStatus = classification === "auto_publish" ? "published" : "needs_review";

  // Duplicate detection against this exam's existing question bank —
  // required by the brief's flow (extraction → validation → duplicate
  // detection → Supabase) before anything is written.
  const { data: existingQuestions } = await supabase
    .from("questions")
    .select("id, content_hash, paper_id, papers!inner(exam_slug)")
    .eq("papers.exam_slug", parsed.examSlug);
  const existingHashes = new Map<string, string>((existingQuestions ?? []).map((q: { content_hash: string; id: string }) => [q.content_hash, q.id]));
  const dedupeResults = detectDuplicates(parsed.questions, existingHashes);

  const { data: paperRow, error: paperInsertError } = await supabase
    .from("papers")
    .insert({
      exam_slug: parsed.examSlug,
      exam_short_name: parsed.examShortName,
      exam_category: parsed.examCategory,
      year: parsed.year,
      stage: parsed.stage,
      shift: parsed.shift,
      title: parsed.title,
      duration_minutes: parsed.durationMinutes,
      total_marks: parsed.totalMarks,
      total_questions: 0, // updated below once real inserts are known
      official_source_url: input.documentUrl,
      source_document_url: input.documentUrl,
      source_type: input.sourceId ? "official_pdf_index" : "admin_manual",
      status: paperStatus,
      extraction_confidence: parsed.confidence,
      content_hash: contentHash,
      ingestion_run_id: run.id,
    })
    .select("id")
    .single();

  if (paperInsertError || !paperRow) {
    await supabase.from("paper_ingestion_runs").update({ status: "failed", error_message: paperInsertError?.message ?? "Could not create paper.", completed_at: now }).eq("id", run.id);
    return { ok: false, duplicate: false, paperId: null, classification, questionsInserted: 0, questionsSkippedAsDuplicate: 0, error: paperInsertError?.message ?? "Could not create paper." };
  }

  const paperId: string = paperRow.id;

  // Sections
  const sectionIdByName = new Map<string, string>();
  for (const section of parsed.sections) {
    const { data: sectionRow } = await supabase
      .from("paper_sections")
      .insert({ paper_id: paperId, name: section.name, order_index: section.orderIndex, duration_minutes: section.durationMinutes })
      .select("id")
      .single();
    if (sectionRow) sectionIdByName.set(section.name, sectionRow.id);
  }
  // A question can reference a section name the parser didn't separately
  // list in `sections` — create it implicitly rather than dropping the
  // question's section association.
  for (const q of parsed.questions) {
    if (q.sectionName && !sectionIdByName.has(q.sectionName)) {
      const { data: sectionRow } = await supabase
        .from("paper_sections")
        .insert({ paper_id: paperId, name: q.sectionName, order_index: sectionIdByName.size })
        .select("id")
        .single();
      if (sectionRow) sectionIdByName.set(q.sectionName, sectionRow.id);
    }
  }

  // Marking schemes
  for (const scheme of parsed.markingSchemes) {
    const sectionId = scheme.sectionName ? sectionIdByName.get(scheme.sectionName) ?? null : null;
    await supabase.from("marking_schemes").insert({
      paper_id: paperId,
      section_id: sectionId,
      correct_marks: scheme.correctMarks,
      incorrect_marks: scheme.incorrectMarks,
      unattempted_marks: scheme.unattemptedMarks,
    });
  }
  if (parsed.markingSchemes.length === 0) {
    // Always leave a paper-wide default row so scoring never has to guess
    // at runtime — 1 / 0 is the same safe fallback lib/pyq/scoring.ts uses.
    await supabase.from("marking_schemes").insert({ paper_id: paperId, section_id: null, correct_marks: 1, incorrect_marks: 0, unattempted_marks: 0 });
  }

  // Questions + options
  let questionsInserted = 0;
  let questionsSkippedAsDuplicate = 0;
  const sectionQuestionCounts = new Map<string, number>();

  for (const dedupe of dedupeResults) {
    if (dedupe.isDuplicate) {
      questionsSkippedAsDuplicate++;
      await supabase.from("paper_ingestion_audit_log").insert({
        run_id: run.id,
        paper_id: paperId,
        event_type: "question_flagged_duplicate",
        new_value: { questionNumber: dedupe.question.questionNumber, duplicateOfQuestionId: dedupe.duplicateOfQuestionId },
      });
      continue;
    }

    const q = dedupe.question;
    const questionClassification = classifyQuestion(q);
    if (questionClassification === "reject") {
      continue; // Never store unusable extraction output — see classify.ts.
    }

    const sectionId = q.sectionName ? sectionIdByName.get(q.sectionName) ?? null : null;

    const { data: questionRow, error: questionError } = await supabase
      .from("questions")
      .insert({
        paper_id: paperId,
        section_id: sectionId,
        question_number: q.questionNumber,
        question_type: q.questionType,
        prompt: q.prompt,
        prompt_image_url: q.promptImageUrl,
        correct_numeric_value: q.correctNumericValue,
        explanation: q.explanation,
        topic: q.topic,
        marks: q.marks,
        negative_marks: q.negativeMarks,
        status: paperStatus, // the paper is the reviewable unit — see admin review action
        extraction_confidence: q.confidence,
        source_reference: q.sourceReference,
        content_hash: dedupe.contentHash,
      })
      .select("id")
      .single();

    if (questionError || !questionRow) continue; // Best-effort — one bad row shouldn't abort the whole paper.

    for (const [i, opt] of q.options.entries()) {
      await supabase.from("question_options").insert({
        question_id: questionRow.id,
        option_label: opt.label,
        option_text: opt.text,
        is_correct: opt.isCorrect,
        order_index: i,
      });
    }

    questionsInserted++;
    if (sectionId) sectionQuestionCounts.set(sectionId, (sectionQuestionCounts.get(sectionId) ?? 0) + 1);
  }

  // Sync denormalized counts.
  await supabase.from("papers").update({ total_questions: questionsInserted, updated_at: now }).eq("id", paperId);
  for (const [sectionId, count] of sectionQuestionCounts.entries()) {
    await supabase.from("paper_sections").update({ question_count: count }).eq("id", sectionId);
  }

  const finalRunStatus = classification === "auto_publish" ? "auto_published" : "needs_review";
  await supabase
    .from("paper_ingestion_runs")
    .update({ status: finalRunStatus, paper_id: paperId, classification, extracted_question_count: questionsInserted, extraction_confidence: parsed.confidence, completed_at: now })
    .eq("id", run.id);

  await supabase.from("paper_ingestion_audit_log").insert({
    run_id: run.id,
    paper_id: paperId,
    event_type: classification === "auto_publish" ? "auto_published" : "needs_review",
    new_value: { questionsInserted, questionsSkippedAsDuplicate },
  });

  if (input.sourceId) {
    await supabase.from("paper_ingestion_sources").update({ last_checked_at: now, last_success_at: now, last_error: null, last_content_hash: contentHash, updated_at: now }).eq("id", input.sourceId);
  }

  return { ok: true, duplicate: false, paperId, classification, questionsInserted, questionsSkippedAsDuplicate, error: null };
}
