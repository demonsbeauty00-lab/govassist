import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-4xl font-semibold text-brand-700">404</p>
      <p className="mt-2 text-[15px] font-medium text-ink">Page not found</p>
      <p className="mt-1 text-sm text-ink-muted">The page you're looking for doesn't exist or has moved.</p>
      <Link href="/home" className="mt-6">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
