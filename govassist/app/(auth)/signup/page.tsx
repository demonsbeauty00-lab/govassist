"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/ErrorState";
import { Card } from "@/components/ui/Card";
import { signUpAction, ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth isLoading={pending}>
      Continue
    </Button>
  );
}

export default function SignupPage() {
  const [state, formAction] = useFormState(signUpAction, initialState);

  if (state.success) {
    return (
      <div className="app-shell flex min-h-screen flex-col px-4 py-8">
        <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>
        <Card className="mt-10 p-4">
          <p className="text-[15px] font-semibold text-ink">Almost there</p>
          <p className="mt-1 text-sm text-ink-muted">{state.message}</p>
        </Card>
        <Link href="/login" className="mt-6 text-center text-sm font-medium text-brand-600">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen flex-col px-4 py-8">
      <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>

      <div className="mt-10">
        <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Takes about a minute. We'll ask a few more questions after this to check exam eligibility.
        </p>
      </div>

      <form action={formAction} className="mt-8 space-y-4" noValidate>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={state.fieldErrors?.email}
          placeholder="you@example.com"
        />
        <Input
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          error={state.fieldErrors?.phone}
          placeholder="98765 43210"
          hint="Used for admit card and deadline alerts by SMS."
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          placeholder="At least 8 characters"
        />

        {state.error && (
          <ErrorState title="Couldn't create your account" description={state.error} />
        )}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600">
          Log in
        </Link>
      </p>
    </div>
  );
}
