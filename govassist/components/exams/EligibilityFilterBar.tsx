"use client";

import { Chip } from "@/components/ui/Chip";
import { EligibilityCategory } from "@/lib/eligibility/types";

const filters: { value: EligibilityCategory | "All"; label: string }[] = [
  { value: "All", label: "All" },
  { value: "potentially_eligible", label: "Eligible" },
  { value: "needs_review", label: "Needs Review" },
  { value: "likely_not_eligible", label: "Not Eligible" },
];

export function EligibilityFilterBar({
  selected,
  onSelect,
}: {
  selected: EligibilityCategory | "All";
  onSelect: (c: EligibilityCategory | "All") => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter by eligibility">
      {filters.map((f) => (
        <Chip key={f.value} label={f.label} selected={selected === f.value} onClick={() => onSelect(f.value)} />
      ))}
    </div>
  );
}
