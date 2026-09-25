"use client";

import { Chip } from "@/components/ui/Chip";
import { ExamCategory } from "@/lib/types";

const categories: (ExamCategory | "All")[] = [
  "All",
  "SSC",
  "Railways",
  "Banking",
  "Police",
  "Defence",
  "Teaching",
  "State Government",
  "Other",
];

export function CategoryFilterBar({
  selected,
  onSelect,
}: {
  selected: ExamCategory | "All";
  onSelect: (c: ExamCategory | "All") => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter by category">
      {categories.map((c) => (
        <Chip key={c} label={c} selected={selected === c} onClick={() => onSelect(c)} />
      ))}
    </div>
  );
}
