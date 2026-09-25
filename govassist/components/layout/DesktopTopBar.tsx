"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SearchIcon, BellIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { getTopBarInfoAction } from "@/lib/actions/dashboard";
import { signOutAction } from "@/lib/actions/auth";

export function DesktopTopBar() {
  const router = useRouter();
  const [info, setInfo] = useState<{ fullName: string | null; unreadNotificationCount: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loggingOut, startLogoutTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTopBarInfoAction().then((result) => {
      if (!result.error) setInfo({ fullName: result.fullName, unreadNotificationCount: result.unreadNotificationCount });
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = info?.fullName?.trim() || "there";
  const initial = displayName.charAt(0).toUpperCase();

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = search.trim();
    router.push(trimmed ? `/jobs?q=${encodeURIComponent(trimmed)}` : "/jobs");
  }

  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center justify-between gap-4 border-b border-hairline bg-paper px-6 md:flex">
      <form onSubmit={handleSearchSubmit} className="w-full max-w-md">
        <label className="relative block">
          <SearchIcon width={17} height={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exams, jobs, papers…"
            className="h-10 w-full rounded-lg border border-hairline bg-paper-raised pl-9 pr-3 text-sm text-ink"
          />
        </label>
      </form>

      <div className="flex shrink-0 items-center gap-4">
        <Link href="/notifications" aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-paper-sunk">
          <BellIcon width={20} height={20} />
          {info && info.unreadNotificationCount > 0 && (
            <span className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ineligible-fg px-1 text-[10px] font-semibold text-white">
              {info.unreadNotificationCount > 9 ? "9+" : info.unreadNotificationCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-paper-sunk">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initial}
            </span>
            <span className="text-sm font-medium text-ink">{displayName}</span>
            <ChevronDownIcon width={16} height={16} className="text-ink-faint" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-hairline bg-paper-raised py-1 shadow-lg">
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-ink hover:bg-paper-sunk">
                View Profile
              </Link>
              <Link href="/settings" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-ink hover:bg-paper-sunk">
                Settings
              </Link>
              <button
                onClick={() => startLogoutTransition(async () => await signOutAction())}
                disabled={loggingOut}
                className="block w-full px-4 py-2 text-left text-sm text-ineligible-fg hover:bg-paper-sunk"
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
