"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExamCard } from "@/components/exams/ExamCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { ExamsIcon } from "@/components/ui/Icons";
import { ExamWithEligibility } from "@/lib/types";

type Bucket = "potentially_eligible" | "saved" | "applied" | "upcoming" | "completed";

const bucketLabels: Record<Bucket, string> = {
  potentially_eligible: "Potentially eligible",
  saved: "Saved",
  applied: "Applied",
  upcoming: "Upcoming",
  completed: "Completed",
};

interface MyExamsClientProps {
  allExams: ExamWithEligibility[];
  savedIds: string[];
  appliedIds: string[];
}

export function MyExamsClient({ allExams, savedIds, appliedIds }: MyExamsClientProps) {
  const [bucket, setBucket] = useState<Bucket>("potentially_eligible");

  const applied = useMemo(() => allExams.filter((e) => appliedIds.includes(e.exam.id)), [allExams, appliedIds]);

  const buckets: Record<Bucket, ExamWithEligibility[]> = useMemo(
    () => ({
      potentially_eligible: allExams.filter((e) => e.eligibilityCategory === "potentially_eligible"),
      saved: allExams.filter((e) => savedIds.includes(e.exam.id)),
      applied,
      upcoming: applied.filter((e) => e.exam.importantDates.some((d) => new Date(d.date) > new Date())),
      completed: applied.filter((e) => e.exam.importantDates.every((d) => new Date(d.date) <= new Date())),
    }),
    [allExams, savedIds, applied]
  );

  const activeList = buckets[bucket];

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(Object.keys(bucketLabels) as Bucket[]).map((b) => (
          <Chip key={b} label={`${bucketLabels[b]} (${buckets[b].length})`} selected={bucket === b} onClick={() => setBucket(b)} />
        ))}
      </div>

      <div className="mt-4">
        {activeList.length === 0 ? (
          <EmptyState
            icon={<ExamsIcon />}
            title={emptyTitle(bucket)}
            description={emptyDescription(bucket)}
            action={
              bucket !== "applied" && bucket !== "upcoming" && bucket !== "completed" ? (
                <Link href="/jobs">
                  <Button size="sm" variant="secondary">Browse jobs</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {activeList.map(({ exam, eligibilityCategory }) => (
              <ExamCard key={exam.id} exam={exam} eligibilityCategory={eligibilityCategory} isSaved={savedIds.includes(exam.id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function emptyTitle(bucket: Bucket) {
  switch (bucket) {
    case "potentially_eligible": return "No matches yet";
    case "saved": return "Nothing saved";
    case "applied": return "No applications yet";
    case "upcoming": return "Nothing upcoming";
    case "completed": return "No completed exams";
  }
}

function emptyDescription(bucket: Bucket) {
  switch (bucket) {
    case "potentially_eligible": return "Complete your profile so we can check eligibility across exams.";
    case "saved": return "Save exams from the Jobs tab to keep track of them here.";
    case "applied": return "Exams you've applied for will show up here.";
    case "upcoming": return "Applied exams with a scheduled date will appear here.";
    case "completed": return "Exams you've finished — including past results — will appear here.";
  }
}
