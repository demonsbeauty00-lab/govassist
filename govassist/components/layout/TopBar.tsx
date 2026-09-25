"use client";

import { useState, useTransition, SVGProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackArrowIcon, BellIcon } from "@/components/ui/Icons";
import { demoNotifications } from "@/lib/mock-data";
import { signOutAction } from "@/lib/actions/auth";

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  showBell?: boolean;
}

/** A small, self-contained logout icon — kept local to this file rather
 *  than added to the shared icon set, since it's only used here. */
function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" />
      <path d="M10 12h10M17 8l3.5 4L17 16" />
    </svg>
  );
}

export function TopBar({ title, showBack, showBell = true }: TopBarProps) {
  const router = useRouter();
  const unreadCount = demoNotifications.filter((n) => !n.isRead).length;
  const [loggingOut, startLogoutTransition] = useTransition();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  function handleLogoutClick() {
    if (!confirmingLogout) {
      setConfirmingLogout(true);
      return;
    }
    startLogoutTransition(async () => {
      // signOutAction redirects to /login itself once the Supabase
      // session is cleared — same server action Settings already uses,
      // so logout behaves identically wherever it's triggered from.
      await signOutAction();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-paper/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        {showBack ? (
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="-ml-2 flex tap-target items-center justify-center text-ink"
          >
            <BackArrowIcon />
          </button>
        ) : null}
        {title ? (
          <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
        ) : (
          <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showBell && (
          <Link
            href="/notifications"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            className="relative flex tap-target items-center justify-center text-ink"
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500" />
            )}
          </Link>
        )}
        {confirmingLogout && !loggingOut && (
          <button
            onClick={() => setConfirmingLogout(false)}
            className="tap-target rounded px-2 text-sm font-medium text-ink-muted"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleLogoutClick}
          disabled={loggingOut}
          aria-label={confirmingLogout ? "Confirm log out" : "Log out"}
          title={confirmingLogout ? "Tap again to log out" : "Log out"}
          className={
            confirmingLogout
              ? "tap-target flex items-center justify-center rounded px-2 text-sm font-semibold text-ineligible-fg"
              : "tap-target flex items-center justify-center text-ink-faint"
          }
        >
          {confirmingLogout ? (loggingOut ? "Logging out…" : "Confirm") : <LogoutIcon />}
        </button>
      </div>
    </header>
  );
}
