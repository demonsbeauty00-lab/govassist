"use client";

import Link from "next/link";
import { NAV_ITEMS, FOOTER_NAV_ITEMS, NavItem } from "./nav-items";
import { CloseIcon, ChevronRightIcon, CheckCircleIcon } from "@/components/ui/Icons";
import { cx } from "@/lib/utils";
import { usePathname } from "next/navigation";

function DrawerRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  if (item.comingSoon) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-[15px] text-ink-faint" aria-disabled="true">
        <span className="flex items-center gap-3">
          <Icon width={20} height={20} strokeWidth={1.8} />
          {item.label}
        </span>
        <span className="rounded-full bg-paper-sunk px-2 py-0.5 text-[10px] font-medium text-ink-muted">Soon</span>
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx("flex items-center gap-3 px-5 py-3 text-[15px] font-medium", active ? "bg-brand-50 text-brand-700" : "text-ink")}
    >
      <Icon width={20} height={20} strokeWidth={active ? 2.1 : 1.8} />
      {item.label}
    </Link>
  );
}

export function MobileDrawer({
  open,
  onClose,
  fullName,
  email,
}: {
  open: boolean;
  onClose: () => void;
  fullName: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");
  const displayName = fullName?.trim() || "there";
  const initial = displayName.charAt(0).toUpperCase();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm overflow-y-auto bg-paper-raised pb-6 shadow-raised">
        <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
          <span className="font-display text-[18px] font-semibold text-brand-700">GovAssist</span>
          <button onClick={onClose} aria-label="Close menu" className="tap-target flex items-center justify-center text-ink">
            <CloseIcon width={22} height={22} />
          </button>
        </div>

        <Link href="/profile" onClick={onClose} className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-semibold text-brand-700">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{displayName}</p>
            {email && <p className="truncate text-sm text-ink-muted">{email}</p>}
          </div>
          <ChevronRightIcon className="shrink-0 text-ink-faint" />
        </Link>

        <p className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-faint">Main Menu</p>
        <nav className="pb-2" aria-label="Primary">
          {[...NAV_ITEMS, ...FOOTER_NAV_ITEMS].map((item) => (
            <DrawerRow key={item.href} item={item} active={!item.comingSoon && isActive(item.href)} onNavigate={onClose} />
          ))}
        </nav>

        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-eligible-bg p-3.5">
          <CheckCircleIcon width={18} height={18} className="mt-0.5 shrink-0 text-eligible-fg" />
          <p className="text-sm text-eligible-fg">
            <span className="font-semibold">GovAssist is completely free.</span> No hidden charges — all features are available for every
            student.
          </p>
        </div>
      </div>
    </div>
  );
}
