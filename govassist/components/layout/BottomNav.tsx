"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  JobsIcon,
  ExamsIcon,
  PreparationIcon,
  ProfileIcon,
} from "@/components/ui/Icons";
import { cx } from "@/lib/utils";

// Matches the reference's 5-tab mobile bottom nav (Home / Exams / Saved /
// Tests / Profile). "Exams" here is the full browse-all-exams list
// (route: /jobs) and "Saved" is the user's saved/eligible/applied list
// (route: /exams) — same real routes as before, relabeled to match the
// reference; Document Vault moved to the hamburger drawer (see
// nav-items.ts) rather than taking a 6th bottom-nav slot.
const items = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/jobs", label: "Exams", icon: JobsIcon },
  { href: "/exams", label: "Saved", icon: ExamsIcon },
  { href: "/preparation", label: "Tests", icon: PreparationIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 border-t border-hairline bg-paper-raised pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-between">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium tap-target",
                  active ? "text-brand-600" : "text-ink-faint"
                )}
              >
                <Icon width={22} height={22} strokeWidth={active ? 2.1 : 1.8} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
