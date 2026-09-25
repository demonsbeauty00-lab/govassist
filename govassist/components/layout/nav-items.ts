import {
  HomeIcon,
  BellIcon,
  CheckCircleIcon,
  UploadIcon,
  PreparationIcon,
  PapersIcon,
  ResultsIcon,
  DocumentsIcon,
  ExamsIcon,
  ProfileIcon,
  SettingsIcon,
  HelpIcon,
} from "@/components/ui/Icons";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  comingSoon?: boolean;
}

// Real, working routes only — Apply Assistant and Results are Phase
// 10/13 in the master context and don't exist yet, so they're listed but
// marked "Soon" rather than silently dropped or wired to something fake.
// Apply Assistant does link somewhere (a real "coming soon" explanation
// page), so it's still a normal item; Results has nowhere real to go yet,
// so it stays non-clickable in both Sidebar and MobileDrawer.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Dashboard", icon: HomeIcon },
  { href: "/notifications", label: "Notifications", icon: BellIcon },
  { href: "/jobs", label: "Eligibility Check", icon: CheckCircleIcon },
  { href: "/apply-assistant", label: "Apply Assistant", icon: UploadIcon, comingSoon: true },
  { href: "/preparation", label: "Mock Tests", icon: PreparationIcon },
  { href: "/preparation/pyq", label: "Previous Papers", icon: PapersIcon },
  { href: "/results", label: "Results", icon: ResultsIcon, comingSoon: true },
  { href: "/documents", label: "Document Vault", icon: DocumentsIcon },
  { href: "/exams", label: "Saved Exams", icon: ExamsIcon },
];

export const FOOTER_NAV_ITEMS: NavItem[] = [
  { href: "/profile", label: "Profile", icon: ProfileIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/help", label: "Help & Support", icon: HelpIcon },
];
