import { Database } from "@/lib/supabase/database.types";
import { EligibilityRules } from "./types";

type ExamCycleRow = Database["public"]["Tables"]["exam_cycles"]["Row"];

/**
 * Converts a real exam_cycles row (plus its parent exam's state, since
 * domicile is published against the *exam*, not the cycle) into the
 * engine's input shape. Not called anywhere yet — Jobs/Exams still read
 * lib/mock-data.ts (see lib/eligibility/from-exam-cycle.ts for that mapper).
 * This exists so that moving those pages onto the real exam_cycles table
 * later is a one-line swap of which mapper feeds evaluateEligibility(),
 * not a rewrite of the engine or the UI.
 */
export function examCycleRowToRules(row: ExamCycleRow, examState: string | null): EligibilityRules {
  const categoryRules = row.category_rules as { eligibleCategories?: string[] } | null;

  return {
    ageMin: row.age_min,
    ageMax: row.age_max,
    ageCutoffDate: row.age_cutoff_date ?? row.notification_date,
    ageRelaxationByCategory: row.age_relaxation_rules ?? {},
    requiredDegree: row.required_degree,
    requiredSubject: row.required_subject,
    minPercentage: row.min_percentage,
    eligibleCategories: categoryRules?.eligibleCategories ?? null,
    domicileRequired: row.domicile_required,
    examState,
    genderRequirement: row.gender_requirement,
    physicalRequirements: row.physical_requirements,
    experienceRequirements: row.experience_requirements,
    otherConditions: row.other_conditions,
    notificationDate: row.notification_date,
  };
}
