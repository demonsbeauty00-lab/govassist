import Link from "next/link";
import { StatTile } from "@/components/exams/StatTile";
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { ExamNotificationRow } from "@/components/home/ExamNotificationRow";
import { HeroIllustration } from "@/components/home/HeroIllustration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { CheckCircleIcon, UploadIcon, PreparationIcon, DocumentsIcon, ChevronRightIcon, ExamsIcon } from "@/components/ui/Icons";
import { ExamCycle } from "@/lib/types";
import { EXAM_CATEGORY_OPTIONS } from "@/lib/constants";
import { DashboardSummary } from "@/lib/actions/dashboard";

interface HomeStats {
  potentiallyEligible: number;
  applicationsOpen: number;
  deadlinesNear: number;
  savedExams: number;
}

interface HomeContentProps {
  firstName: string;
  completionPercent: number;
  stats: HomeStats;
  latestExams: ExamCycle[];
  savedSlugs: string[];
  summary: DashboardSummary;
  totalExamsCovered: number;
}

// Colors deliberately reuse Tailwind's built-in palette (purple/pink/cyan
// etc.) alongside this app's own brand/eligible/caution tokens — see
// tailwind.config.ts's `extend`, which keeps the default palette available
// rather than replacing it, so this isn't an arbitrary one-off color.
const QUICK_ACTIONS = [
  { href: "/jobs", label: "Eligibility Check", desc: "Check which exams you are eligible for", icon: CheckCircleIcon, tone: "text-eligible-fg bg-eligible-bg" },
  { href: "/apply-assistant", label: "Apply Assistant", desc: "AI auto-fills your form in a few clicks", icon: UploadIcon, tone: "text-purple-600 bg-purple-50" },
  { href: "/preparation", label: "Mock Tests", desc: "Practice with PYQs & full length tests", icon: PreparationIcon, tone: "text-brand-700 bg-brand-50" },
  { href: "/documents", label: "Document Vault", desc: "Securely store your important documents", icon: DocumentsIcon, tone: "text-caution-fg bg-caution-bg" },
];

// Category tiles cycle through a fixed pastel palette so the grid reads as
// colorful, matching the reference, without depending on any per-exam data
// we don't have (there's no real "category color" field in the schema).
const CATEGORY_TONES = ["bg-pink-50 text-pink-600", "bg-brand-50 text-brand-700", "bg-amber-50 text-amber-700", "bg-cyan-50 text-cyan-700", "bg-eligible-bg text-eligible-fg", "bg-ineligible-bg text-ineligible-fg", "bg-purple-50 text-purple-600"];

export function HomeContent({ firstName, completionPercent, stats, latestExams, savedSlugs, summary, totalExamsCovered }: HomeContentProps) {
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      {/* The exam catalog below is still sample data (see lib/mock-data.ts)
          — your name, profile %, eligibility, documents, and mock test
          performance are all computed live from your account. */}
      <DemoBanner label="Exam data below is sample — your name, profile %, eligibility, documents & mock scores are real" />

      <div className="mt-3 flex items-center gap-4 overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 p-5">
        <div className="min-w-0 flex-1">
          <p className="inline-block rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white">
            {greeting}, {firstName}! 👋
          </p>
          <h1 className="mt-2 text-xl font-semibold leading-snug text-ink md:text-2xl">
            Your Government Job Journey <span className="text-brand-600">Starts Here</span>
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-ink-muted">
            Find the latest exams, check eligibility, prepare smartly &amp; secure your future.
          </p>
        </div>
        <HeroIllustration className="h-20 w-20 shrink-0 sm:h-32 sm:w-32 md:h-40 md:w-40" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card interactive className="h-full p-4">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.tone}`}>
                <action.icon width={19} height={19} />
              </span>
              <p className="mt-2.5 text-[14px] font-semibold text-ink">{action.label}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{action.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 md:grid md:grid-cols-3 md:gap-5">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Latest Government Exam Notifications</h2>
            <Link href="/jobs" className="text-sm font-medium text-brand-600">
              View All
            </Link>
          </div>
          <Card className="mt-3 p-4">
            {latestExams.length === 0 ? (
              <EmptyState title="Nothing new right now" description="Check back soon for new exam notifications." />
            ) : (
              latestExams.map((exam) => <ExamNotificationRow key={exam.id} exam={exam} isSaved={savedSlugs.includes(exam.id)} />)
            )}
          </Card>

          <h2 className="mt-6 text-[15px] font-semibold text-ink">Your exam dashboard</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Potentially eligible" value={stats.potentiallyEligible} href="/exams" />
            <StatTile label="Applications open" value={stats.applicationsOpen} href="/jobs" />
            <StatTile label="Deadlines near" value={stats.deadlinesNear} href="/exams" />
            <StatTile label="Saved exams" value={stats.savedExams} href="/exams" />
          </div>
        </div>

        <div className="mt-6 space-y-4 md:mt-0">
          <Card className="border-eligible-fg/30 bg-eligible-bg p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-eligible-fg">
                <CheckCircleIcon width={19} height={19} />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-eligible-fg">Check Your Eligibility</p>
                <p className="mt-1 text-sm text-ink-muted">Upload your details &amp; documents to see which exams you can apply for.</p>
              </div>
            </div>
            <Link href="/jobs">
              <Button size="sm" className="mt-3">
                Check Now
              </Button>
            </Link>
          </Card>

          <ProfileCompletionCard percent={completionPercent} />

          <Link href="/documents">
            <Card interactive className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-ink">Document Vault</p>
                <ChevronRightIcon className="text-ink-faint" />
              </div>
              <p className="mt-1 text-sm text-ink-muted">{summary.documentsUploadedCount} document(s) uploaded</p>
              {summary.recentDocumentTypes.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {summary.recentDocumentTypes.map((type, i) => (
                    <span key={`${type}-${i}`} className="flex h-9 flex-1 items-center justify-center rounded-md bg-brand-50 px-1 text-center text-[10px] font-medium leading-tight text-brand-700">
                      {type}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </Link>

          <Link href="/preparation/pyq">
            <Card interactive className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-ink">Mock Test Performance</p>
                <span className="text-sm font-medium text-brand-600">View All</span>
              </div>
              {summary.mockTests.completedCount > 0 ? (
                <div className="mt-3 flex items-center gap-4">
                  <CircularProgress percent={summary.mockTests.averageScorePercent ?? 0} color="stroke-brand-600">
                    <span className="text-[15px] font-semibold text-ink">{summary.mockTests.averageScorePercent}%</span>
                  </CircularProgress>
                  <div>
                    <p className="text-sm font-medium text-ink">Your average score</p>
                    <p className="text-sm text-ink-muted">{summary.mockTests.completedCount} test(s) completed</p>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-ink-muted">No attempts yet — take your first mock test.</p>
              )}
            </Card>
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Explore by Category</h2>
        <Link href="/jobs" className="text-sm font-medium text-brand-600">
          View All
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3 md:grid-cols-8">
        {EXAM_CATEGORY_OPTIONS.slice(0, 7).map((cat, i) => (
          <Link key={cat} href={`/jobs?category=${encodeURIComponent(cat)}`}>
            <Card interactive className="flex flex-col items-center gap-1.5 p-3 text-center">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${CATEGORY_TONES[i % CATEGORY_TONES.length]}`}>
                <ExamsIcon width={18} height={18} />
              </span>
              <span className="text-[11px] font-medium leading-tight text-ink">{cat}</span>
            </Card>
          </Link>
        ))}
        <Link href="/jobs">
          <Card interactive className="flex h-full flex-col items-center justify-center gap-1.5 p-3 text-center">
            <ChevronRightIcon className="text-brand-600" />
            <span className="text-[11px] font-medium text-brand-600">View All</span>
          </Card>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Card className="bg-purple-50 p-3.5 text-center">
          <p className="font-display text-xl font-semibold text-purple-600">{totalExamsCovered}+</p>
          <p className="text-xs text-ink-muted">Exams Covered</p>
        </Card>
        <Card className="bg-eligible-bg p-3.5 text-center">
          <p className="font-display text-xl font-semibold text-eligible-fg">{summary.publishedPaperCount}</p>
          <p className="text-xs text-ink-muted">Previous Papers</p>
        </Card>
        <Card className="bg-caution-bg p-3.5 text-center">
          <p className="font-display text-xl font-semibold text-caution-fg">24/7</p>
          <p className="text-xs text-ink-muted">Updates &amp; Alerts</p>
        </Card>
      </div>
    </>
  );
}
