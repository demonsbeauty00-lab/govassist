"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// How long a navigation must be in flight before the bar actually renders
// — per the brief's "fast action: don't flash a spinner" rule. Below this,
// most navigations finish and nothing is ever shown.
const SHOW_DELAY_MS = 150;
// Safety net only: clears a stuck bar (e.g. a link to an external
// redirect, or a same-route click that never changes the pathname) rather
// than leaving it spinning forever. Not a substitute for fixing real
// slow-loading routes — see loading.tsx additions for that.
const MAX_DURATION_MS = 8000;

/**
 * Mounted once in the root layout. Tracks two independent things:
 *   1. "a navigation was just clicked" — detected via a capture-phase
 *      click listener on the document, so it works for every <Link> in
 *      the app (sidebar, bottom nav, dashboard cards, "View All" links…)
 *      without touching any of those components individually.
 *   2. "the route actually changed" — detected via usePathname() /
 *      useSearchParams(), which also covers router.push() calls that
 *      didn't originate from a click.
 * The visible bar is the overlap: started by (1), cleared by (2).
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}

/** useSearchParams() opts the subtree into client-side rendering until the
 *  param is known, so Next.js requires this Suspense boundary — isolated
 *  here so every call site (just the root layout) stays a one-line drop-in. */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [atFull, setAtFull] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigating = useRef(false);

  const routeKey = `${pathname}?${searchParams.toString()}`;
  const previousRouteKey = useRef(routeKey);

  // (2) Route actually changed — complete and hide the bar.
  useEffect(() => {
    if (previousRouteKey.current === routeKey) return;
    previousRouteKey.current = routeKey;
    if (!navigating.current) return;
    navigating.current = false;
    if (showTimer.current) clearTimeout(showTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    setAtFull(true);
    setTimeout(() => setVisible(false), 200); // let the 100% state paint before it fades
    setTimeout(() => setAtFull(false), 400);
  }, [routeKey]);

  // (1) A real in-app navigation click just happened.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same route
      if (url.pathname === window.location.pathname && url.hash) return; // same-page anchor jump

      navigating.current = true;
      setAtFull(false);
      showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      maxTimer.current = setTimeout(() => {
        navigating.current = false;
        setVisible(false);
      }, MAX_DURATION_MS);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed left-0 top-0 z-[60] h-[3px] w-full overflow-hidden bg-transparent" aria-hidden="true">
      <div
        className="h-full bg-brand-600 transition-all ease-out"
        style={{
          width: atFull ? "100%" : "80%",
          transitionDuration: atFull ? "200ms" : "1800ms",
        }}
      />
    </div>
  );
}
