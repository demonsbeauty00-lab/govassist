"use client";

import { useState, useTransition } from "react";
import { toggleSavedExamAction } from "@/lib/actions/saved-exams";
import { cx } from "@/lib/utils";

/** A simple bookmark glyph — kept local rather than in the shared icon set
 *  since it's only ever used here, filled/outlined by save state. */
function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveExamButton({ examSlug, initiallySaved }: { examSlug: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault(); // cards wrap this in a Link — don't navigate on save
    e.stopPropagation();

    const next = !saved;
    setSaved(next); // optimistic
    setError(null);

    startTransition(async () => {
      const result = await toggleSavedExamAction(examSlug);
      if (result.error) {
        setSaved(!next); // revert
        setError(result.error);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved exams" : "Save this exam"}
      title={error ?? undefined}
      className={cx(
        "tap-target flex items-center justify-center rounded-full text-ink-faint transition-colors",
        saved && "text-accent-500"
      )}
    >
      <BookmarkGlyph filled={saved} />
    </button>
  );
}
