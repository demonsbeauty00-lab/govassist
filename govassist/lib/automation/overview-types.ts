// Shapes returned to the control center page. Plain data, safe to serialise.
// Deliberately contains NO personal data: no user ids, emails, request
// contents or documents - only counts, source/exam names and error text.

import type { CycleCounts } from "./cycles";
import type { SourceCounts, SourceHealth } from "./sources";
import type { RequestStatus } from "@/lib/application-requests/constants";

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SourceItem {
  id: string;
  organization: string;
  url: string;
  health: SourceHealth;
  enabled: boolean;
  needsMaintenance: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  parserVersion: string;
}

export interface SourcesSection {
  counts: SourceCounts;
  items: SourceItem[];
  paper: { total: number; active: number; inactive: number; maintenance: number; withErrors: number };
}

export interface StuckUpdate { id: string; title: string; detectedAt: string; organization: string | null }

export interface UpdatesSection {
  windowDays: number;
  /** Within the window. */
  detected: number;
  processed: number;
  published: number;
  rejected: number;
  /** Live backlog, not limited to the window. */
  needsReview: number;
  oldestNeedsReviewAt: string | null;
  stuckAutoPublish: StuckUpdate[];
}

export interface ClosingSoon { id: string; label: string; endDate: string; daysLeft: number }
export interface CyclesSection { counts: CycleCounts; closingSoon: ClosingSoon[] }

export interface DocumentsSection {
  user: { processing: number; needsReview: number; verified: number };
  ingestion: { processing: number; successful: number; needsReview: number; failed: number; rejected: number };
}

export interface FailedDelivery { id: string; channel: string; attempts: number; lastError: string | null; updatedAt: string }

export interface NotificationsSection {
  windowDays: number;
  batches: number;
  created: number;
  duplicatesPrevented: number;
  disabledByPreference: number;
  failed: number;
  /** When batch logging began; earlier history is not counted. */
  loggedSince: string | null;
  inAppCreated: number;
  deliveries: { pending: number; sent: number; delivered: number; failed: number; skipped: number };
  failedDeliveries: FailedDelivery[];
}

export interface RequestsSection {
  open: number;
  overdue: number;
  byStatus: Record<RequestStatus, number>;
  notificationFailures: number;
}

export interface SessionsSection {
  active: number;
  paused: number;
  needsUserAction: number;
  blockedSubmissions: number;
}

export interface JobRunItem { startedAt: string; finishedAt: string | null; ok: boolean | null; summary: Record<string, unknown> }
export interface JobsSection { checkSources: JobRunItem | null; checkPyqSources: JobRunItem | null }

export interface AuditItem {
  id: string;
  createdAt: string;
  action: string;
  outcome: string;
  targetType: string;
  targetId: string | null;
  /** First 8 characters only. */
  adminRef: string | null;
  note: string | null;
}

export interface AutomationOverview {
  generatedAt: string;
  sources: Loaded<SourcesSection>;
  updates: Loaded<UpdatesSection>;
  cycles: Loaded<CyclesSection>;
  documents: Loaded<DocumentsSection>;
  notifications: Loaded<NotificationsSection>;
  requests: Loaded<RequestsSection>;
  sessions: Loaded<SessionsSection>;
  jobs: Loaded<JobsSection>;
  audit: Loaded<AuditItem[]>;
}
