"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { signOutAction } from "@/lib/actions/auth";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState({
    deadlineReminders: true,
    admitCardAlerts: true,
    resultAlerts: true,
    smsAlerts: true,
  });
  const [loggingOut, setLoggingOut] = useState(false);

  function updatePref<K extends keyof typeof prefs>(key: K, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
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
          <div className="mt-1 divide-y divide-hairline">
            <Toggle
              id="deadline"
              label="Deadline reminders"
              description="Before an application window closes"
              checked={prefs.deadlineReminders}
              onChange={(v) => updatePref("deadlineReminders", v)}
            />
            <Toggle
              id="admitcard"
              label="Admit card alerts"
              description="When an admit card is released"
              checked={prefs.admitCardAlerts}
              onChange={(v) => updatePref("admitCardAlerts", v)}
            />
            <Toggle
              id="result"
              label="Result alerts"
              description="When a result you're tracking is out"
              checked={prefs.resultAlerts}
              onChange={(v) => updatePref("resultAlerts", v)}
            />
            <Toggle
              id="sms"
              label="SMS alerts"
              description="In addition to in-app notifications"
              checked={prefs.smsAlerts}
              onChange={(v) => updatePref("smsAlerts", v)}
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
