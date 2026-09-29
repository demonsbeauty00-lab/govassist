"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { signOutAction } from "@/lib/actions/auth";
import { getNotificationPreferencesAction, updateNotificationPreferenceAction } from "@/lib/actions/notification-preferences";
import { PreferenceKey } from "@/lib/notifications/preferences";

export default function SettingsPage() {
  // Real, persisted preferences (profiles.notification_preferences) — null
  // while loading or if they couldn't be loaded, in which case the toggles
  // stay disabled rather than showing values that aren't actually saved.
  const [prefs, setPrefs] = useState<Record<PreferenceKey, boolean> | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);

  useEffect(() => {
    getNotificationPreferencesAction().then((res) => {
      if (res.preferences) setPrefs(res.preferences);
      else setPrefsError(res.error ?? "Couldn't load your notification settings.");
    });
  }, []);

  const [loggingOut, setLoggingOut] = useState(false);

  async function updatePref(key: PreferenceKey, value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    setSavingKey(key);
    setPrefsError(null);
    const res = await updateNotificationPreferenceAction(key, value);
    setSavingKey(null);
    if (res.error || !res.preferences) {
      setPrefs(previous); // revert — never show a value that wasn't saved
      setPrefsError(res.error ?? "Couldn't save that change.");
      return;
    }
    setPrefs(res.preferences);
  }

  async function handleLogout() {
    setLoggingOut(true);
    // signOutAction redirects to /login itself once the Supabase session is
    // cleared — no client-side navigation needed here.
    await signOutAction();
  }

  return (
    <AppShell title="Settings" showBack>
      <DemoBanner />

      <div className="mt-3 space-y-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Account</p>
          <div className="mt-2 divide-y divide-hairline">
            <SettingsRow label="Email" value="aditi.sharma@example.com" />
            <SettingsRow label="Mobile number" value="+91 98765 43210" />
            <SettingsRow label="Password" value="Change password" href="#" />
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          <p className="mt-1 text-sm text-ink-muted">
            Alerts only come from verified official updates, and only for exams that are relevant to you.
          </p>
          {prefsError && <p className="mt-2 text-sm text-ineligible-fg">{prefsError}</p>}
          <div className="mt-1 divide-y divide-hairline">
            <Toggle
              id="deadline"
              label="Deadline & application alerts"
              description="Applications opening, deadline changes"
              checked={prefs?.deadline ?? false}
              disabled={!prefs || savingKey === "deadline"}
              onChange={(v) => updatePref("deadline", v)}
            />
            <Toggle
              id="admitcard"
              label="Admit card alerts"
              description="When an admit card is released"
              checked={prefs?.admit_card ?? false}
              disabled={!prefs || savingKey === "admit_card"}
              onChange={(v) => updatePref("admit_card", v)}
            />
            <Toggle
              id="result"
              label="Answer key & result alerts"
              description="Answer keys, response sheets, results and cutoffs"
              checked={prefs?.result ?? false}
              disabled={!prefs || savingKey === "result"}
              onChange={(v) => updatePref("result", v)}
            />
            <Toggle
              id="system"
              label="Other official updates"
              description="New notifications, exam dates, corrigenda"
              checked={prefs?.system ?? false}
              disabled={!prefs || savingKey === "system"}
              onChange={(v) => updatePref("system", v)}
            />
            <Toggle
              id="eligible"
              label="Exams that match my profile"
              description="Alert me when a new exam I'm potentially eligible for is announced, even if I haven't saved it. Off by default."
              checked={prefs?.eligible_alerts ?? false}
              disabled={!prefs || savingKey === "eligible_alerts"}
              onChange={(v) => updatePref("eligible_alerts", v)}
            />
            <Toggle
              id="sms"
              label="SMS alerts"
              description="Not available yet — no SMS delivery is set up"
              checked={false}
              disabled
              onChange={() => {}}
            />
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Privacy & data</p>
          <div className="mt-2 divide-y divide-hairline">
            <Link href="/documents" className="flex items-center justify-between py-2.5">
              <span className="text-[15px] text-ink">Manage documents</span>
              <ChevronRightIcon className="text-ink-faint" />
            </Link>
            <SettingsRow label="Download my data" href="#" />
            <SettingsRow label="Delete account" href="#" tone="danger" />
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">About</p>
          <div className="mt-2 divide-y divide-hairline">
            <SettingsRow label="App version" value="0.1.0 (Phase 1)" />
            <SettingsRow label="Terms of service" href="#" />
            <SettingsRow label="Privacy policy" href="#" />
          </div>
        </Card>

        <Button variant="danger" fullWidth onClick={handleLogout} isLoading={loggingOut}>
          Log out
        </Button>
      </div>
    </AppShell>
  );
}

function SettingsRow({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value?: string;
  href?: string;
  tone?: "danger";
}) {
  const content = (
    <div className="flex items-center justify-between py-2.5">
      <span className={`text-[15px] ${tone === "danger" ? "text-ineligible-fg" : "text-ink"}`}>{label}</span>
      {value ? (
        <span className="text-sm text-ink-muted">{value}</span>
      ) : href ? (
        <ChevronRightIcon className="text-ink-faint" />
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
