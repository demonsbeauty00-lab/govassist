import { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { DesktopTopBar } from "./DesktopTopBar";
import { MobileHeaderWithDrawer } from "./MobileHeaderWithDrawer";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  /** "default" (unchanged, used by every existing page) shows the
   *  back-arrow/title mobile header. "hamburger" swaps in
   *  MobileHeaderWithDrawer instead — reserved for top-level tabs like the
   *  dashboard, matching the reference's mobile header. */
  variant?: "default" | "hamburger";
}

/**
 * Responsive by breakpoint, not by rebuilding the mobile experience: below
 * md, this renders exactly what it always has (TopBar + single-column
 * content + BottomNav, capped at max-w-app) — untouched for every existing
 * page. At md and above, a fixed Sidebar + DesktopTopBar take over and the
 * mobile TopBar/BottomNav are hidden via `md:hidden`, so there's one
 * component tree per page, not two divergent ones to keep in sync.
 */
export function AppShell({ children, title, showBack, variant = "default" }: AppShellProps) {
  return (
    <div className="app-shell md:mx-0 md:max-w-none">
      <div className="md:hidden">{variant === "hamburger" ? <MobileHeaderWithDrawer /> : <TopBar title={title} showBack={showBack} />}</div>

      <Sidebar />

      <div className="md:pl-64">
        <DesktopTopBar />
        <main className="px-4 pb-24 pt-4 md:mx-auto md:max-w-5xl md:px-8 md:pb-10 md:pt-6">{children}</main>
      </div>

      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
