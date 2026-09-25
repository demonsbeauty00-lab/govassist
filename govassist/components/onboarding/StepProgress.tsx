export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand-600" : "bg-paper-sunk"}`}
        />
      ))}
    </div>
  );
}
