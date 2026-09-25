"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Phase 2: send to an error-tracking service (e.g. Sentry) here.
    console.error(error);
  }, [error]);

  if (error.name === "ConfigError") {
    return <ConfigErrorScreen message={error.message} />;
  }

  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-[17px] font-semibold text-ink">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-muted">
        This has been logged. Your data is safe — try again.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
