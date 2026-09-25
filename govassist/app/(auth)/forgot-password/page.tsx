"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { requestPasswordResetAction, ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth isLoading={pending}>
      Send reset link
    </Button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordResetAction, initialState);

  return (
    <div className="app-shell flex min-h-screen flex-col px-4 py-8">
      <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>

      <div className="mt-10">
        <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Enter the email on your account and we'll send a link to reset your password.
        </p>
      </div>

      {state.success ? (
        <Card className="mt-8 p-4">
          <p className="text-[15px] font-medium text-ink">Check your email</p>
          <p className="mt-1 text-sm text-ink-muted">{state.message}</p>
        </Card>
      ) : (
        <form action={formAction} className="mt-8 space-y-4" noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={state.fieldErrors?.email}
            placeholder="you@example.com"
          />
          <SubmitButton />
        </form>
      )}

      <Link href="/login" className="mt-6 text-center text-sm font-medium text-brand-600">
        Back to login
      </Link>
    </div>
  );
}
