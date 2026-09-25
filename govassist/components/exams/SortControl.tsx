"use client";

export type SortOption = "newest" | "last_date" | "exam_date";

const options: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "last_date", label: "Last date" },
  { value: "exam_date", label: "Exam date" },
];

export function SortControl({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Sort by
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="h-9 rounded border border-hairline bg-paper-raised px-2 text-sm text-ink focus-visible:border-brand-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
