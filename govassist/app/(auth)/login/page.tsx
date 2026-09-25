"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/ErrorState";
import { signInAction, ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth isLoading={pending}>
      Log in
    </Button>
  );
}

import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction] = useFormState(signInAction, initialState);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/home";

  return (
    <div className="app-shell flex min-h-screen flex-col px-4 py-8">
      <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>

      <div className="mt-10">
        <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-muted">Log in to continue tracking your exams.</p>
      </div>

      <form action={formAction} className="mt-8 space-y-4" noValidate>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={state.fieldErrors?.email}
          placeholder="you@example.com"
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
          placeholder="••••••••"
        />

        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600">
            Forgot password?
          </Link>
        </div>

        {state.error && (
          <ErrorState title="Couldn't log you in" description={state.error} />
        )}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New to GovAssist?{" "}
        <Link href="/signup" className="font-medium text-brand-600">
          Create an account
        </Link>
      </p>
    </div>
  );
}
