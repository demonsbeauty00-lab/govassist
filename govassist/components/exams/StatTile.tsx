import Link from "next/link";
import { Card } from "@/components/ui/Card";

export function StatTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card interactive className="p-3.5">
        <p className="font-display text-2xl font-semibold leading-none text-brand-700">{value}</p>
        <p className="mt-1.5 text-[13px] leading-tight text-ink-muted">{label}</p>
      </Card>
    </Link>
  );
}
