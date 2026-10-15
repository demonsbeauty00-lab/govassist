import {
  HomeIcon,
  BellIcon,
  CheckCircleIcon,
  UploadIcon,
  PreparationIcon,
  PapersIcon,
  ResultsIcon as AnswerKeyIcon,
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

// Real, working routes only. Application Requests (manual admin assistance) lives at /apply-assistant.
// Results (Phase 13) doesn't exist yet, so it is listed but marked "Soon"
// and stays non-clickable in both Sidebar and MobileDrawer.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Dashboard", icon: HomeIcon },
  { href: "/notifications", label: "Notifications", icon: BellIcon },
  { href: "/discover", label: "Exam Discovery", icon: ExamsIcon },
  { href: "/jobs", label: "Eligibility Check", icon: CheckCircleIcon },
  { href: "/apply-assistant", label: "Application Requests", icon: UploadIcon },
  { href: "/preparation", label: "Mock Tests", icon: PreparationIcon },
  { href: "/preparation/pyq", label: "Previous Papers", icon: PapersIcon },
  { href: "/answer-key", label: "Answer Key Calculator", icon: AnswerKeyIcon },
  { href: "/results", label: "Results", icon: ResultsIcon, comingSoon: true },
  { href: "/documents", label: "Document Vault", icon: DocumentsIcon },
  { href: "/exams", label: "Saved Exams", icon: ExamsIcon },
];

export const FOOTER_NAV_ITEMS: NavItem[] = [
  { href: "/profile", label: "Profile", icon: ProfileIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/help", label: "Help & Support", icon: HelpIcon },
];
