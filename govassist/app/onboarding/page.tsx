"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { Chip } from "@/components/ui/Chip";
import { StepProgress } from "@/components/onboarding/StepProgress";
import { INDIAN_STATES, CATEGORY_OPTIONS, QUALIFICATION_OPTIONS, EXAM_CATEGORY_OPTIONS } from "@/lib/constants";
import { ExamCategory, UserCategory } from "@/lib/types";
import { completeOnboardingAction } from "@/lib/actions/profile";

interface FormState {
  fullName: string;
  dob: string;
  gender: "Male" | "Female" | "Other" | "";
  state: string;
  category: UserCategory | "";
  isPwBD: boolean;
  qualification: string;
  graduationSubject: string;
  passingYear: string;
  preferredCategories: ExamCategory[];
}

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    fullName: "",
    dob: "",
    gender: "",
    state: "",
    category: "",
    isPwBD: false,
    qualification: "",
    graduationSubject: "",
    passingYear: "",
    preferredCategories: [],
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCategory(cat: ExamCategory) {
    setForm((f) => ({
      ...f,
      preferredCategories: f.preferredCategories.includes(cat)
        ? f.preferredCategories.filter((c) => c !== cat)
        : [...f.preferredCategories, cat],
    }));
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!form.fullName.trim()) return "Enter your full name.";
      if (!form.dob) return "Enter your date of birth.";
      if (!form.gender) return "Select your gender.";
    }
    if (step === 2) {
      if (!form.state) return "Select your state.";
      if (!form.category) return "Select your category.";
    }
    if (step === 3) {
      if (!form.qualification) return "Select your highest qualification.";
    }
    if (step === 4) {
      if (form.preferredCategories.length === 0) return "Pick at least one exam category.";
    }
    return null;
  }

  function handleNext() {
    const err = validateStep();
    setError(err);
    if (err) return;
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    submitOnboarding();
  }

  async function submitOnboarding() {
    setStatus("loading");
    setError(null);

    const formData = new FormData();
    formData.set("full_name", form.fullName);
    formData.set("dob", form.dob);
    formData.set("gender", form.gender);
    formData.set("state", form.state);
    formData.set("category", form.category);
    formData.set("is_pwbd", String(form.isPwBD));
    for (const cat of form.preferredCategories) formData.append("preferred_categories", cat);
    formData.set("qualification_level", form.qualification);
    formData.set("subject", form.graduationSubject);
    formData.set("passing_year", form.passingYear);

    // completeOnboardingAction redirects to /home on success (throwing
    // Next's internal redirect signal), so a returned value here always
    // means something needs the user's attention.
    const result = await completeOnboardingAction({}, formData);
    setStatus("idle");
    if (result?.error) {
      setError(result.error);
    } else if (result?.fieldErrors) {
      setError(Object.values(result.fieldErrors)[0] ?? "Check the details above.");
    }
  }

  return (
    <div className="app-shell flex min-h-screen flex-col px-4 py-6">
      <StepProgress step={step} total={TOTAL_STEPS} />
      <p className="mt-2 text-sm text-ink-faint">Step {step} of {TOTAL_STEPS}</p>

      {step === 1 && (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Let's start with the basics</h1>
            <p className="mt-1 text-sm text-ink-muted">
              This is used to check age eligibility across exams — nothing more.
            </p>
          </div>
          <Input label="Full name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} placeholder="As per your certificates" />
          <Input label="Date of birth" type="date" value={form.dob} onChange={(e) => update("dob", e.target.value)} />
          <Select
            label="Gender"
            value={form.gender}
            onChange={(e) => update("gender", e.target.value as FormState["gender"])}
            placeholder="Select gender"
            options={[
              { label: "Male", value: "Male" },
              { label: "Female", value: "Female" },
              { label: "Other", value: "Other" },
            ]}
          />
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Where are you from?</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Some exams reserve seats by state domicile or category — this helps us flag those correctly.
            </p>
          </div>
          <Select
            label="State"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            placeholder="Select your state"
            options={INDIAN_STATES.map((s) => ({ label: s, value: s }))}
          />
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => update("category", e.target.value as UserCategory)}
            placeholder="Select your category"
            options={CATEGORY_OPTIONS.map((c) => ({ label: c, value: c }))}
          />
          <Toggle
            id="pwbd"
            checked={form.isPwBD}
            onChange={(v) => update("isPwBD", v)}
            label="Person with Benchmark Disability (PwBD)"
            description="Unlocks age and fee relaxations you may be entitled to."
          />
        </section>
      )}

      {step === 3 && (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Your education</h1>
            <p className="mt-1 text-sm text-ink-muted">Most exams set a minimum qualification — this narrows down what applies to you.</p>
          </div>
          <Select
            label="Highest qualification"
            value={form.qualification}
            onChange={(e) => update("qualification", e.target.value)}
            placeholder="Select qualification"
            options={QUALIFICATION_OPTIONS.map((q) => ({ label: q, value: q }))}
          />
          {(form.qualification === "Graduate" || form.qualification === "Post Graduate") && (
            <>
              <Input
                label="Graduation subject"
                value={form.graduationSubject}
                onChange={(e) => update("graduationSubject", e.target.value)}
                placeholder="e.g. B.A. Political Science"
              />
              <Input
                label="Passing year"
                inputMode="numeric"
                value={form.passingYear}
                onChange={(e) => update("passingYear", e.target.value)}
                placeholder="e.g. 2023"
              />
            </>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">What are you preparing for?</h1>
            <p className="mt-1 text-sm text-ink-muted">Pick as many as apply — you can change this anytime from your profile.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAM_CATEGORY_OPTIONS.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                selected={form.preferredCategories.includes(cat)}
                onClick={() => toggleCategory(cat)}
              />
            ))}
          </div>
        </section>
      )}

      {error && <p className="mt-4 text-sm text-ineligible-fg">{error}</p>}

      <div className="mt-auto flex gap-3 pt-8">
        {step > 1 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button fullWidth onClick={handleNext} isLoading={status === "loading"}>
          {step === TOTAL_STEPS ? "Finish setup" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
