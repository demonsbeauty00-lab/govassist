"use client";

import { useEffect, useState } from "react";
import { getTopBarInfoAction } from "@/lib/actions/dashboard";

export interface TopBarInfo {
  fullName: string | null;
  email: string | null;
  unreadNotificationCount: number;
}

const EMPTY: TopBarInfo = { fullName: null, email: null, unreadNotificationCount: 0 };

// Module-scoped, deliberately NOT persisted anywhere (no storage, no
// context, no long-lived cache) — this only coalesces calls that overlap
// within the same instant. It's cleared the moment the request settles,
// so it can never hand a later page view, or a different user's session,
// stale or cached data; it just stops two components that both mounted in
// the same tick (DesktopTopBar + MobileHeaderWithDrawer, both present on
// the /home route — one hidden by CSS at any given breakpoint, but both
// still mount and both previously fired their own request) from doubling
// up on the exact same request.
let inFlight: Promise<TopBarInfo> | null = null;

function fetchTopBarInfo(): Promise<TopBarInfo> {
  if (!inFlight) {
    inFlight = getTopBarInfoAction()
      .then((result): TopBarInfo => (result.error ? EMPTY : { fullName: result.fullName, email: result.email, unreadNotificationCount: result.unreadNotificationCount }))
      .catch(() => EMPTY)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Used by DesktopTopBar and MobileHeaderWithDrawer. Returns null until
 *  the first fetch resolves, same as each of those previously managed on
 *  their own. */
export function useTopBarInfo(): TopBarInfo | null {
  const [info, setInfo] = useState<TopBarInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTopBarInfo().then((result) => {
      if (!cancelled) setInfo(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
