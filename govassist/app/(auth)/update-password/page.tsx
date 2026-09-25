"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/ErrorState";
import { updatePasswordAction, ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth isLoading={pending}>
      Update password
    </Button>
  );
}

export default function UpdatePasswordPage() {
  const [state, formAction] = useFormState(updatePasswordAction, initialState);

  return (
    <div className="app-shell flex min-h-screen flex-col px-4 py-8">
      <span className="font-display text-[19px] font-semibold text-brand-700">GovAssist</span>

      <div className="mt-10">
        <h1 className="text-2xl font-semibold text-ink">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">You've followed a valid reset link — set a new password below.</p>
      </div>

      <form action={formAction} className="mt-8 space-y-4" noValidate>
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          placeholder="At least 8 characters"
        />
        <Input
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.confirmPassword}
          placeholder="Re-enter your new password"
        />

        {state.error && <ErrorState title="Couldn't update your password" description={state.error} />}

        <SubmitButton />
      </form>
    </div>
  );
}
