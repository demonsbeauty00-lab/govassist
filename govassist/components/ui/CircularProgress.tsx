import { ReactNode } from "react";

interface CircularProgressProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string; // stroke color, e.g. "stroke-brand-600"
  trackColor?: string; // e.g. "stroke-paper-sunk"
  children?: ReactNode; // rendered centered inside the ring (the % label)
}

/** A plain SVG ring — no chart library needed for a single-value donut. */
export function CircularProgress({
  percent,
  size = 72,
  strokeWidth = 7,
  color = "stroke-brand-600",
  trackColor = "stroke-paper-sunk",
  children,
}: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className={trackColor} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={color}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
