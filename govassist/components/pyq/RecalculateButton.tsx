"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { recalculateAttemptAction } from "@/lib/actions/answer-key";

export function RecalculateButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await recalculateAttemptAction(attemptId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button size="sm" onClick={handleClick} isLoading={pending}>
        Recalculate with current answer key
      </Button>
      {error && <p className="mt-1.5 text-sm text-ineligible-fg">{error}</p>}
    </div>
  );
}
