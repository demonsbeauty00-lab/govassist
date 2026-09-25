import { cx } from "@/lib/utils";

type Tone = "neutral" | "positive" | "warning" | "negative" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-paper-sunk text-ink-muted",
  positive: "bg-eligible-bg text-eligible-fg",
  warning: "bg-caution-bg text-caution-fg",
  negative: "bg-ineligible-bg text-ineligible-fg",
  brand: "bg-brand-50 text-brand-700",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium", toneClasses[tone])}>
      {children}
    </span>
  );
}
