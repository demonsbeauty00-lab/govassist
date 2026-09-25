import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EligibilityPill } from "@/components/ui/EligibilityPill";
import { LockIcon } from "@/components/ui/Icons";

const journeySteps = [
  {
    n: "01",
    title: "Upload your documents",
    body: "Marksheets, category certificate, photo — or pull them straight from DigiLocker.",
  },
  {
    n: "02",
    title: "We check eligibility across exams",
    body: "Age, qualification and category rules are checked against each exam's official notification.",
  },
  {
    n: "03",
    title: "Track deadlines, admit cards and results",
    body: "One dashboard for every exam you're tracking — no more juggling ten tabs and WhatsApp forwards.",
  },
];

export default function LandingPage() {
  return (
    <div className="app-shell">
      <header className="flex h-14 items-center justify-between px-4">
        <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>
        <Link href="/login" className="text-sm font-medium text-brand-600">
          Log in
        </Link>
      </header>

      <main className="px-4 pb-16 pt-6">
        <h1 className="font-display text-[30px] font-semibold leading-[1.15] text-ink">
          Know where you stand, before the form closes.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          GovAssist checks your profile against SSC, Railways, Banking, Police, Defence and State
          government exams, and tells you exactly why you match or don't.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link href="/signup">
            <Button fullWidth>Create free account</Button>
          </Link>
          <Link href="/login">
            <Button fullWidth variant="secondary">
              I already have an account
            </Button>
          </Link>
        </div>

        <Card className="mt-8 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Example</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-ink">SSC CGL 2026</p>
              <p className="text-sm text-ink-muted">Graduate-level, 18–32 years</p>
            </div>
            <EligibilityPill category="potentially_eligible" />
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            "Your age and qualification match this cycle's published criteria. Eligibility is
            never guaranteed — always confirm against the official notification before applying."
          </p>
        </Card>

        <div className="mt-10 space-y-6">
          {journeySteps.map((step) => (
            <div key={step.n} className="flex gap-4">
              <span className="font-display text-lg font-semibold text-accent-500">{step.n}</span>
              <div>
                <p className="font-medium text-ink">{step.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-start gap-3 rounded border border-hairline bg-paper-raised p-4">
          <LockIcon className="mt-0.5 shrink-0 text-brand-600" />
          <p className="text-sm text-ink-muted">
            Your documents are stored privately and are only ever used the way you permit —
            never shared without your action. We prefer DigiLocker over asking you to re-upload
            documents you've already digitised with the government.
          </p>
        </div>
      </main>
    </div>
  );
}
