"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { BellIcon } from "@/components/ui/Icons";
import { listNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";
import {
  categoryLabelFor,
  countUnread,
  EMAIL_STATUS_LABEL,
  markRead,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationItem,
} from "@/lib/notifications/inbox";
import { formatDate } from "@/lib/utils";
import { cx } from "@/lib/utils";

const legacyTone: Record<NotificationItem["legacyType"], "warning" | "brand" | "positive" | "neutral"> = {
  deadline: "warning",
  admit_card: "brand",
  result: "positive",
  system: "neutral",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function announceChange() {
  try {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  } catch {
    // non-browser environment: nothing to refresh
  }
}

export default function NotificationsPage() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setState("loading");
    const res = await listNotificationsAction().catch(() => null);
    if (!res || res.error) {
      setState("error");
      return;
    }
    setItems(res.items);
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openItem(item: NotificationItem) {
    if (item.isRead) return;
    // Optimistic, then confirmed; on failure the item goes back to unread.
    setItems((list) => markRead(list, [item.id]));
    void markNotificationReadAction(item.id).then((res) => {
      if (res.error) {
        setItems((list) => list.map((i) => (i.id === item.id ? { ...i, isRead: false } : i)));
        setMessage(res.error);
      } else {
        announceChange();
      }
    });
  }

  function markAll() {
    setMessage(null);
    startTransition(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.error) {
        setMessage(res.error);
        return;
      }
      setItems((list) => markRead(list, "all"));
      announceChange();
    });
  }

  const unread = countUnread(items);

  return (
    <AppShell title="Notifications" showBack>
      {state === "loading" && (
        <div className="mt-3 space-y-3" aria-busy="true" aria-label="Loading notifications">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {state === "error" && (
        <div className="mt-4">
          <ErrorState title="Couldn't load your notifications" onRetry={() => void load()} />
        </div>
      )}

      {state === "ready" && items.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<BellIcon />}
            title="No notifications yet"
            description="Alerts for exams you follow - deadlines, admit cards, results and updates on your requests - will appear here. You can choose what you get in Settings."
          />
        </div>
      )}

      {state === "ready" && items.length > 0 && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted" aria-live="polite">{unread > 0 ? `${unread} unread` : "All caught up"}</p>
            <Button variant="ghost" size="sm" onClick={markAll} disabled={unread === 0} isLoading={pending}>
              Mark all as read
            </Button>
          </div>
          {message && <p role="alert" className="mt-2 text-sm text-ineligible-fg">{message}</p>}
          <ul className="mt-3 space-y-3">
            {items.map((n) => (
              <li key={n.id}>
                <Card className={cx("p-4", !n.isRead && "border-brand-300")}>
                  <div className="flex items-center gap-2">
                    <Badge tone={legacyTone[n.legacyType]}>{categoryLabelFor(n)}</Badge>
                    {!n.isRead && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" /> Unread
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 break-words text-[15px] font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 break-words text-sm text-ink-muted">{n.body}</p>
                  {(n.organization || n.publishedOn) && (
                    <p className="mt-1 text-xs text-ink-faint">
                      {[n.organization, n.publishedOn ? `Published ${formatDate(n.publishedOn)}` : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="text-ink-faint">{timeAgo(n.createdAt)}</span>
                    {n.emailStatus && <span className="text-ink-faint">{EMAIL_STATUS_LABEL[n.emailStatus]}</span>}
                    {n.linkUrl && (
                      <Link href={n.linkUrl} onClick={() => openItem(n)} className="font-medium text-brand-700 underline">
                        View details
                      </Link>
                    )}
                    {n.sourceUrl && (
                      <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline">
                        Official source
                      </a>
                    )}
                    {!n.isRead && (
                      <button type="button" onClick={() => openItem(n)} className="font-medium text-ink-muted underline">
                        Mark as read
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
