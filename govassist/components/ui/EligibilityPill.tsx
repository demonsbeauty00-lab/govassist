import { EligibilityCategory, RESULT_CATEGORY_LABEL } from "@/lib/eligibility/types";
import { cx } from "@/lib/utils";

const styles: Record<EligibilityCategory, string> = {
  potentially_eligible: "bg-eligible-bg text-eligible-fg",
  likely_not_eligible: "bg-ineligible-bg text-ineligible-fg",
  needs_review: "bg-caution-bg text-caution-fg",
};

export function EligibilityPill({ category }: { category: EligibilityCategory }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        styles[category]
      )}
    >
      {RESULT_CATEGORY_LABEL[category]}
    </span>
  );
}

export function eligibilityStripColor(category: EligibilityCategory): string {
  switch (category) {
    case "potentially_eligible":
      return "#2F6B4F";
    case "likely_not_eligible":
      return "#A63D2F";
    case "needs_review":
      return "#C97D2C";
  }
}
