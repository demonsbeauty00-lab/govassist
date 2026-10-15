// Writes a verified update into the user-facing exam_stage_updates table with
// full history. Orchestration is separate from storage (StageStore) so it can
// be tested with an in-memory store; supabaseStageStore() is the real one.

import type { createAdminClient } from "@/lib/supabase/admin";
import { Database } from "@/lib/supabase/database.types";
import { documentKeyFor, ExistingStageRow, isRevisionTitle, planVersioning, resolveAmbiguous, seriesKey, VersionAction } from "./versioning";

type DetectedUpdateRow = Database["public"]["Tables"]["detected_updates"]["Row"];
type StageRow = Database["public"]["Tables"]["exam_stage_updates"]["Row"];
type UpdateType = DetectedUpdateRow["update_type"];

export interface NewStageRow {
  exam_cycle_id: string;
  detected_update_id: string;
  update_type: UpdateType;
  title: string;
  organization: string;
  publication_date: string | null;
  event_date: string | null;
  source_url: string;
  official_page_url: string;
  series_key: string;
  document_key: string;
  version: number;
  verification: "auto_verified" | "admin_verified";
  /** Set only for a late-arriving older document. */
  superseded_by: string | null;
}

export interface StageStore {
  findByDetectedUpdate(detectedUpdateId: string): Promise<{ id: string; isLatest: boolean; version: number } | null>;
  listForCycleType(cycleId: string, type: UpdateType): Promise<ExistingStageRow[]>;
  /** Inserts as NOT latest. Returns duplicate:true on a unique violation. */
  insert(row: NewStageRow): Promise<{ id: string } | { duplicate: true } | { error: string }>;
  /** Demote old rows to history, pointing them at newId. */
  demote(ids: string[], newId: string): Promise<{ error?: string }>;
  restore(ids: string[]): Promise<void>;
  promote(id: string): Promise<{ error?: string }>;
  remove(id: string): Promise<void>;
}

export interface PublishResult {
  ok: boolean;
  /** "already" = this detected update was published before (idempotent re-run). */
  action: VersionAction | "already";
  stageUpdateId: string | null;
  version: number;
  supersededIds: string[];
  /** True when this document is now the latest verified version. */
  isLatest: boolean;
  error?: string;
}

export async function publishStageUpdate(params: {
  store: StageStore;
  update: DetectedUpdateRow;
  organization: string;
  verification: "auto_verified" | "admin_verified";
}): Promise<PublishResult> {
  const { store, update } = params;
  const fail = (error: string): PublishResult => ({ ok: false, action: "new", stageUpdateId: null, version: 0, supersededIds: [], isLatest: false, error });

  if (!update.exam_cycle_id) return fail("Update is not linked to an exam cycle.");

  const prior = await store.findByDetectedUpdate(update.id);
  if (prior) {
    return { ok: true, action: "already", stageUpdateId: prior.id, version: prior.version, supersededIds: [], isLatest: prior.isLatest };
  }

  const key = update.series_key ?? seriesKey(update.title, update.update_type);
  const docKey = documentKeyFor(update.document_url, update.official_url, update.title);
  const existing = await store.listForCycleType(update.exam_cycle_id, update.update_type);

  // Someone approving (or the auto path for a labelled revision) settles ambiguity.
  const plan = resolveAmbiguous(
    planVersioning({
      seriesKey: key,
      documentKey: docKey,
      publicationDate: update.publication_date,
      isRevision: update.is_revision || isRevisionTitle(update.title),
      existing,
    }),
  );

  if (plan.action === "duplicate") {
    return { ok: true, action: "duplicate", stageUpdateId: null, version: 0, supersededIds: [], isLatest: false };
  }

  const inserted = await store.insert({
    exam_cycle_id: update.exam_cycle_id,
    detected_update_id: update.id,
    update_type: update.update_type,
    title: update.title,
    organization: params.organization,
    publication_date: update.publication_date,
    event_date: update.event_date,
    source_url: update.document_url ?? update.official_url,
    official_page_url: update.official_url,
    series_key: key,
    document_key: docKey,
    version: plan.version,
    verification: params.verification,
    superseded_by: plan.action === "historical" ? plan.supersededById : null,
  });
  if ("duplicate" in inserted) {
    return { ok: true, action: "duplicate", stageUpdateId: null, version: 0, supersededIds: [], isLatest: false };
  }
  if ("error" in inserted) return fail(inserted.error);

  if (plan.action === "historical") {
    return { ok: true, action: "historical", stageUpdateId: inserted.id, version: plan.version, supersededIds: [], isLatest: false };
  }

  if (plan.supersedesIds.length > 0) {
    const demoted = await store.demote(plan.supersedesIds, inserted.id);
    if (demoted.error) {
      await store.restore(plan.supersedesIds);
      await store.remove(inserted.id);
      return fail(demoted.error);
    }
  }
  const promoted = await store.promote(inserted.id);
  if (promoted.error) {
    await store.restore(plan.supersedesIds);
    await store.remove(inserted.id);
    return fail(promoted.error);
  }

  return {
    ok: true,
    action: plan.action,
    stageUpdateId: inserted.id,
    version: plan.version,
    supersededIds: plan.supersedesIds,
    isLatest: true,
  };
}

// --- Real store -------------------------------------------------------------

// The real service-role client type (type-only import: nothing server-only is loaded at runtime).
type AdminClient = ReturnType<typeof createAdminClient>;

export function supabaseStageStore(client: AdminClient): StageStore {
  const table = () => client.from("exam_stage_updates");
  return {
    async findByDetectedUpdate(id) {
      const { data } = await table().select("id, is_latest, version").eq("detected_update_id", id).maybeSingle();
      return data ? { id: data.id as string, isLatest: data.is_latest as boolean, version: data.version as number } : null;
    },
    async listForCycleType(cycleId, type) {
      const { data } = await table()
        .select("id, series_key, document_key, publication_date, is_latest, version")
        .eq("exam_cycle_id", cycleId)
        .eq("update_type", type);
      return ((data ?? []) as Pick<StageRow, "id" | "series_key" | "document_key" | "publication_date" | "is_latest" | "version">[]).map((r) => ({
        id: r.id, seriesKey: r.series_key, documentKey: r.document_key, publicationDate: r.publication_date, isLatest: r.is_latest, version: r.version,
      }));
    },
    async insert(row) {
      const { data, error } = await table().insert({ ...row, is_latest: false }).select("id").single();
      if (error) {
        if (error.code === "23505") return { duplicate: true as const };
        return { error: error.message as string };
      }
      return { id: (data as { id: string }).id };
    },
    async demote(ids, newId) {
      const { error } = await table().update({ is_latest: false, superseded_by: newId }).in("id", ids);
      return error ? { error: error.message as string } : {};
    },
    async restore(ids) {
      if (ids.length === 0) return;
      await table().update({ is_latest: true, superseded_by: null }).in("id", ids);
    },
    async promote(id) {
      const { error } = await table().update({ is_latest: true }).eq("id", id);
      return error ? { error: error.message as string } : {};
    },
    async remove(id) {
      await table().delete().eq("id", id);
    },
  };
}
