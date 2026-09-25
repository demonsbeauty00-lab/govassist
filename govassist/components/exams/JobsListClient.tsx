"use client";

import { useMemo, useState } from "react";
import { CategoryFilterBar } from "@/components/exams/CategoryFilterBar";
import { EligibilityFilterBar } from "@/components/exams/EligibilityFilterBar";
import { SortControl, SortOption } from "@/components/exams/SortControl";
import { ExamCard } from "@/components/exams/ExamCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobsIcon } from "@/components/ui/Icons";
import { ExamCategory, ExamWithEligibility } from "@/lib/types";
import { EligibilityCategory } from "@/lib/eligibility/types";
import { deriveExamDate } from "@/lib/notifications/status";

// Sorted-to-the-end sentinel for exams with nothing to sort by on a given
// dimension (e.g. no derivable exam date yet) — keeps them visible at the
// bottom rather than silently dropped or jumbled in with real dates.
const FAR_FUTURE = "9999-12-31";

function sortExams(list: ExamWithEligibility[], sort: SortOption): ExamWithEligibility[] {
  const copy = [...list];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.exam.notificationDate.localeCompare(a.exam.notificationDate));
    case "last_date":
      return copy.sort((a, b) => a.exam.applicationWindow.endDate.localeCompare(b.exam.applicationWindow.endDate));
    case "exam_date":
      return copy.sort((a, b) => {
        const aDate = deriveExamDate(a.exam.importantDates) ?? FAR_FUTURE;
        const bDate = deriveExamDate(b.exam.importantDates) ?? FAR_FUTURE;
        return aDate.localeCompare(bDate);
      });
  }
}

export function JobsListClient({
  examsWithEligibility,
  savedSlugs,
  initialCategory,
  initialQuery,
}: {
  examsWithEligibility: ExamWithEligibility[];
  savedSlugs: string[];
  initialCategory?: ExamCategory;
  initialQuery?: string;
}) {
  const [category, setCategory] = useState<ExamCategory | "All">(initialCategory ?? "All");
  const [eligibility, setEligibility] = useState<EligibilityCategory | "All">("All");
  const [sort, setSort] = useState<SortOption>("newest");
  const query = (initialQuery ?? "").trim().toLowerCase();

  const filtered = useMemo(() => {
    const matches = examsWithEligibility.filter(
      ({ exam, eligibilityCategory }) =>
        (category === "All" || exam.category === category) &&
        (eligibility === "All" || eligibilityCategory === eligibility) &&
        (query === "" || exam.shortName.toLowerCase().includes(query) || exam.examName.toLowerCase().includes(query) || exam.organization.toLowerCase().includes(query))
    );
    return sortExams(matches, sort);
  }, [examsWithEligibility, category, eligibility, sort, query]);

  return (
    <>
      <div className="mt-4">
        <CategoryFilterBar selected={category} onSelect={setCategory} />
      </div>
      <div className="mt-2">
        <EligibilityFilterBar selected={eligibility} onSelect={setEligibility} />
      </div>
      <div className="mt-3 flex justify-end">
        <SortControl value={sort} onChange={setSort} />
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<JobsIcon />}
            title="No exams match these filters"
            description="Try a different category or eligibility filter, or check back — new notifications are added as they're released."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map(({ exam, eligibilityCategory }) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                eligibilityCategory={eligibilityCategory}
                isSaved={savedSlugs.includes(exam.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
