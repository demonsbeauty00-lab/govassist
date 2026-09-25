import { cx } from "@/lib/utils";

export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors tap-target",
        selected
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-hairline bg-paper-raised text-ink-muted hover:border-brand-300"
      )}
    >
      {label}
    </button>
  );
}
