"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { BellIcon } from "@/components/ui/Icons";
import { demoNotifications } from "@/lib/mock-data";
import { useDemoLoadState } from "@/lib/useDemoLoadState";
import { cx } from "@/lib/utils";

const typeTone: Record<string, "warning" | "brand" | "positive" | "neutral"> = {
  deadline: "warning",
  admit_card: "brand",
  result: "positive",
  system: "neutral",
};

const typeLabel: Record<string, string> = {
  deadline: "Deadline",
  admit_card: "Admit card",
  result: "Result",
  system: "Update",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function NotificationsPage() {
  const { state, retry } = useDemoLoadState();
  const [notifications, setNotifications] = useState(demoNotifications);

  function markRead(id: string) {
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  return (
    <AppShell title="Notifications" showBack>
      <DemoBanner />

      {state === "loading" && (
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {state === "error" && (
        <div className="mt-4">
          <ErrorState onRetry={retry} />
        </div>
      )}

      {state === "ready" && notifications.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<BellIcon />}
            title="No notifications"
            description="Deadline reminders, admit card and result alerts will show up here."
          />
        </div>
      )}

      {state === "ready" && notifications.length > 0 && (
        <div className="mt-3 space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              interactive
              role="button"
              tabIndex={0}
              onClick={() => markRead(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") markRead(n.id);
              }}
              className={cx("p-4", !n.isRead && "border-brand-300")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={typeTone[n.type]}>{typeLabel[n.type]}</Badge>
                    {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-label="Unread" />}
                  </div>
                  <p className="mt-1.5 text-[15px] font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-faint">{timeAgo(n.createdAt)}</p>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
