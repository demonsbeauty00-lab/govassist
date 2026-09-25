"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PreparationIcon } from "@/components/ui/Icons";
import { PaperSummary } from "@/lib/pyq/types";

const CATEGORY_OPTIONS = ["All", "SSC", "Railways", "Banking", "Police", "Defence", "Teaching", "State Government", "Other"] as const;

export function PyqLibraryClient({ papers }: { papers: PaperSummary[] }) {
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("All");
  const [examSlug, setExamSlug] = useState<string>("All");
  const [year, setYear] = useState<string>("All");

  const exams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of papers) seen.set(p.examSlug, p.examShortName);
    return Array.from(seen.entries());
  }, [papers]);

  const years = useMemo(() => Array.from(new Set(papers.map((p) => p.year))).sort((a, b) => b - a), [papers]);

  const filtered = useMemo(
    () =>
      papers.filter(
        (p) =>
          (category === "All" || p.examCategory === category) &&
          (examSlug === "All" || p.examSlug === examSlug) &&
          (year === "All" || String(p.year) === year)
      ),
    [papers, category, examSlug, year]
  );

  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter by exam category">
        {CATEGORY_OPTIONS.map((c) => (
          <Chip key={c} label={c} selected={category === c} onClick={() => setCategory(c)} />
        ))}
      </div>

      {(exams.length > 1 || years.length > 1) && (
        <div className="mt-3 flex gap-2">
          {exams.length > 1 && (
            <select
              value={examSlug}
              onChange={(e) => setExamSlug(e.target.value)}
              aria-label="Filter by exam"
              className="h-9 flex-1 rounded border border-hairline bg-paper-raised px-2.5 text-sm text-ink"
            >
              <option value="All">All exams</option>
              {exams.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          )}
          {years.length > 1 && (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Filter by year"
              className="h-9 w-28 rounded border border-hairline bg-paper-raised px-2.5 text-sm text-ink"
            >
              <option value="All">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<PreparationIcon />}
            title="No papers here yet"
            description="Verified previous year papers for this filter haven't been added yet — check back soon."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((paper) => (
              <Link key={paper.id} href={`/preparation/pyq/${paper.id}`}>
                <Card interactive className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ink">{paper.examShortName}</p>
                      <p className="text-sm text-ink-muted">
                        {paper.year} · {paper.stage}
                        {paper.shift ? ` · ${paper.shift}` : ""}
                      </p>
                    </div>
                    <Badge tone="brand">{paper.examCategory}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                    <span>{paper.totalQuestions} questions</span>
                    <span>{paper.durationMinutes} min</span>
                    {paper.totalMarks && <span>{paper.totalMarks} marks</span>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
