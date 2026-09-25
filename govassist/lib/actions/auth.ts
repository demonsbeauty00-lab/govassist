"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signUpSchema, signInSchema, requestPasswordResetSchema, updatePasswordSchema } from "@/lib/validation";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  message?: string;
  /** True when the app itself isn't configured (missing Supabase env vars),
   *  as opposed to a normal validation/auth failure. Lets a form distinguish
   *  "fix your input" from "the deployment needs setup" if it wants to. */
  configError?: boolean;
}

const configErrorState: ActionState = { error: MISSING_SUPABASE_CONFIG_MESSAGE, configError: true };

async function getSiteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUpAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  if (!supabase) return configErrorState;

  const origin = await getSiteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { phone: parsed.data.phone },
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    // Supabase returns a generic-enough message for "already registered" that
    // it's safe to surface directly without leaking extra account details.
    return { error: error.message };
  }

  // Depending on the Supabase project's email-confirmation setting, `data.session`
  // may already be present (auto-confirm) or null (confirmation email required).
  if (data.session) {
    redirect("/onboarding");
  }

  return {
    success: true,
    message: "Check your email to confirm your account, then log in to continue.",
  };
}

export async function signInAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const redirectTo = String(formData.get("redirectTo") ?? "/home");

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  if (!supabase) return configErrorState;

  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Only genuinely wrong credentials get the generic, safe message.
    // Every OTHER Supabase auth error (rate limiting, unconfirmed email,
    // a disabled account, a transient network/server error, etc.) is
    // surfaced as-is — blanket-converting every error into "invalid
    // credentials" is exactly what makes a real, different problem look
    // like a wrong password on a later sign-in attempt.
    const message = error.message?.toLowerCase() ?? "";
    const isWrongCredentials =
      message.includes("invalid login credentials") || message.includes("invalid credentials");

    if (isWrongCredentials) {
      return { error: "That email and password combination didn't match. Try again." };
    }
    return { error: error.message };
  }

  redirect(redirectTo || "/home");
}

export async function signOutAction() {
  const supabase = await createClient();
  // Nothing to sign out of if Supabase isn't configured — just send the
  // user back to /login rather than throwing.
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function requestPasswordResetAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const raw = { email: String(formData.get("email") ?? "") };
  const parsed = requestPasswordResetSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message ?? "Enter a valid email." } };
  }

  const supabase = await createClient();
  if (!supabase) return configErrorState;

  const origin = await getSiteOrigin();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });

  // Always return the same success message regardless of whether the email
  // is registered — otherwise this endpoint becomes a way to enumerate
  // which emails have GovAssist accounts.
  return {
    success: true,
    message: "If an account exists for that email, we've sent a password reset link.",
  };
}

export async function updatePasswordAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };
  const parsed = updatePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  if (!supabase) return configErrorState;

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: error.message };
  }

  redirect("/home");
}
