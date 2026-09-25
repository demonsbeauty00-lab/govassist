-- ============================================================================
-- Phase 3: create the private document storage bucket.
--
-- Previously this was left as a comment in 0001_init.sql for someone to run
-- by hand — easy to miss, and uploads fail silently (bucket not found) if
-- skipped. Making it a real migration statement instead.
--
-- `public: false` is the whole point: files are reachable only through a
-- short-lived signed URL (see getSignedDocumentUrlAction in
-- lib/actions/documents.ts), never a public/static URL. The storage RLS
-- policies already added in 0001_init.sql (documents_storage_select_own /
-- insert_own / delete_own) further restrict access to each file's own
-- uploader, keyed off the first path segment being their user id.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
