import { SelectHTMLAttributes, forwardRef, useId } from "react";
import { cx } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { label: string; value: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, id, className, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className="space-y-1.5">
        <label htmlFor={selectId} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          defaultValue=""
          className={cx(
            "h-11 w-full rounded border bg-paper-raised px-3.5 text-[15px] text-ink",
            error ? "border-ineligible-fg" : "border-hairline focus-visible:border-brand-600",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-ineligible-fg">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
