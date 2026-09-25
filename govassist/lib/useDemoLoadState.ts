"use client";

import { useEffect, useState } from "react";

/**
 * Simulates the loading → ready (or error) lifecycle every screen will have
 * once it's backed by a real API call. Centralized here so every page
 * demonstrates loading/empty/error states consistently without duplicating
 * timer logic. Phase 2 replaces this with a real data-fetching hook
 * (e.g. a TanStack Query call) that returns the same three states.
 *
 * @param options.failOnce - if true, the first load resolves to "error" so
 * the retry affordance is reachable in a demo without special test data.
 */
export function useDemoLoadState(options?: { failOnce?: boolean; delayMs?: number }) {
  const { failOnce = false, delayMs = 500 } = options ?? {};
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState("loading");
    const t = setTimeout(() => {
      setState(failOnce && attempt === 0 ? "error" : "ready");
    }, delayMs);
    return () => clearTimeout(t);
  }, [attempt, failOnce, delayMs]);

  return { state, retry: () => setAttempt((a) => a + 1) };
}
