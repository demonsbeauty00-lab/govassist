import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";

const FAQS = [
  {
    q: "How does eligibility checking work?",
    a: "GovAssist checks your profile (age, education, category, domicile) against each exam's official eligibility rules and shows Potentially Eligible, Likely Not Eligible, or Needs Review when something can't be confirmed automatically.",
  },
  {
    q: "Is my document data safe?",
    a: "Documents are stored privately per account — no other user can access your files, and GovAssist never shares them.",
  },
  {
    q: "How current are exam notifications?",
    a: "Published exam details are sourced from official recruitment pages. If something looks outdated, always cross-check the official application link shown on the exam page before applying.",
  },
  {
    q: "Can I retake a mock test?",
    a: "Yes — each previous year paper can be attempted again from its paper details page; every attempt is scored and saved to your result history.",
  },
];

export default function HelpPage() {
  return (
    <AppShell title="Help & Support" showBack>
      <p className="mt-1 text-sm text-ink-muted">Common questions, and how to reach us if you're stuck.</p>

      <div className="mt-4 space-y-3">
        {FAQS.map((item) => (
          <Card key={item.q} className="p-4">
            <p className="text-[15px] font-semibold text-ink">{item.q}</p>
            <p className="mt-1.5 text-sm text-ink-muted">{item.a}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-4">
        <p className="text-[15px] font-semibold text-ink">Still need help?</p>
        <p className="mt-1.5 text-sm text-ink-muted">
          Write to us at{" "}
          <a href="mailto:support@govassist.app" className="text-brand-600 underline">
            support@govassist.app
          </a>{" "}
          and we'll get back to you.
        </p>
      </Card>
    </AppShell>
  );
}
