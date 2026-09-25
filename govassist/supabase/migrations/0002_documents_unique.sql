-- ============================================================================
-- Phase 3: Document Vault
--
-- A user has at most one active document per type (re-uploading replaces the
-- previous one — we don't keep unlimited old copies, per "do not store
-- unnecessary copies"). This constraint lets upload use a single upsert
-- instead of a manual find-then-update/insert branch.
-- ============================================================================

alter table public.documents
  add constraint documents_user_type_unique unique (user_id, document_type);
