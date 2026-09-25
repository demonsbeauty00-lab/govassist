"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MenuIcon, BellIcon } from "@/components/ui/Icons";
import { getTopBarInfoAction } from "@/lib/actions/dashboard";
import { MobileDrawer } from "./MobileDrawer";

export function MobileHeaderWithDrawer() {
  const [info, setInfo] = useState<{ fullName: string | null; email: string | null; unreadNotificationCount: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    getTopBarInfoAction().then((result) => {
      if (!result.error) setInfo({ fullName: result.fullName, email: result.email, unreadNotificationCount: result.unreadNotificationCount });
    });
  }, []);

  const displayName = info?.fullName?.trim() || "there";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-paper/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="tap-target -ml-2 flex items-center justify-center text-ink">
            <MenuIcon width={22} height={22} />
          </button>
          <span className="font-display text-[18px] font-semibold text-brand-700">GovAssist</span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/notifications" aria-label="Notifications" className="relative flex tap-target items-center justify-center text-ink">
            <BellIcon />
            {info && info.unreadNotificationCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ineligible-fg px-1 text-[10px] font-semibold text-white">
                {info.unreadNotificationCount > 9 ? "9+" : info.unreadNotificationCount}
              </span>
            )}
          </Link>
          <Link href="/profile" aria-label="View profile" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {initial}
          </Link>
        </div>
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} fullName={info?.fullName ?? null} email={info?.email ?? null} />
    </>
  );
}
