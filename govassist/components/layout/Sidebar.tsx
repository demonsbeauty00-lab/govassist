"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, FOOTER_NAV_ITEMS, NavItem } from "./nav-items";
import { cx } from "@/lib/utils";

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  if (item.comingSoon) {
    return (
      <div
        className="flex cursor-not-allowed items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[14px] text-brand-300"
        aria-disabled="true"
      >
        <span className="flex items-center gap-3">
          <Icon width={19} height={19} strokeWidth={1.8} />
          {item.label}
        </span>
        <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white">Soon</span>
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
        active ? "bg-white text-brand-700" : "text-brand-100 hover:bg-brand-500/60 hover:text-white"
      )}
    >
      <Icon width={19} height={19} strokeWidth={active ? 2.1 : 1.8} />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-brand-700 md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-700">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3 4 6.5V11c0 4.8 3.4 9.3 8 10.5 4.6-1.2 8-5.7 8-10.5V6.5L12 3Z" />
          </svg>
        </span>
        <span className="font-display text-[18px] font-semibold text-white">GovAssist</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} active={!item.comingSoon && isActive(item.href)} />
        ))}
      </nav>

      <div className="space-y-1 border-t border-brand-500 px-3 py-3">
        {FOOTER_NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </aside>
  );
}
