import { Database } from "@/lib/supabase/database.types";
import { PaperDetail, PaperMarkingScheme, PaperSectionSummary, PaperSummary } from "./types";

type PaperRow = Database["public"]["Tables"]["papers"]["Row"];
type SectionRow = Database["public"]["Tables"]["paper_sections"]["Row"];
type MarkingSchemeRow = Database["public"]["Tables"]["marking_schemes"]["Row"];

export function paperRowToSummary(row: PaperRow): PaperSummary {
  return {
    id: row.id,
    examSlug: row.exam_slug,
    examShortName: row.exam_short_name,
    examCategory: row.exam_category,
    year: row.year,
    stage: row.stage,
    shift: row.shift,
    title: row.title,
    durationMinutes: row.duration_minutes,
    totalMarks: row.total_marks,
    totalQuestions: row.total_questions,
    officialSourceUrl: row.official_source_url,
    sourceDocumentUrl: row.source_document_url,
    status: row.status,
  };
}

const FALLBACK_SCHEME: PaperMarkingScheme = { correctMarks: 1, incorrectMarks: 0, unattemptedMarks: 0 };

export function paperRowToDetail(
  paperRow: PaperRow,
  sectionRows: SectionRow[],
  markingSchemeRows: MarkingSchemeRow[]
): PaperDetail {
  const sections: PaperSectionSummary[] = sectionRows
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({
      id: s.id,
      name: s.name,
      orderIndex: s.order_index,
      questionCount: s.question_count,
      durationMinutes: s.duration_minutes,
    }));

  const defaultRow = markingSchemeRows.find((m) => m.section_id === null);
  const defaultMarkingScheme: PaperMarkingScheme = defaultRow
    ? { correctMarks: defaultRow.correct_marks, incorrectMarks: defaultRow.incorrect_marks, unattemptedMarks: defaultRow.unattempted_marks }
    : FALLBACK_SCHEME;

  const sectionMarkingSchemes: Record<string, PaperMarkingScheme> = {};
  for (const row of markingSchemeRows) {
    if (row.section_id) {
      sectionMarkingSchemes[row.section_id] = {
        correctMarks: row.correct_marks,
        incorrectMarks: row.incorrect_marks,
        unattemptedMarks: row.unattempted_marks,
      };
    }
  }

  return {
    ...paperRowToSummary(paperRow),
    sections,
    defaultMarkingScheme,
    sectionMarkingSchemes,
  };
}
