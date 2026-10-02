-- ============================================================================
-- Phase 9: document-vault foundation — adds the one genuinely missing
-- document type the brief calls out by name ("identity documents") to the
-- existing documents table from 0001. Everything else the brief asks for —
-- private storage + RLS, OCR-shaped extraction with per-field confidence,
-- a mandatory review gate before anything touches the profile — already
-- exists from Phase 3 and is NOT rebuilt here.
--
-- Same reasoning as 0012 for how the CHECK constraint is widened: rather
-- than assume Postgres's auto-generated name for 0001's unnamed inline
-- check, look up whatever check constraint on documents.document_type
-- actually exists and drop it by its real name.
-- ============================================================================

do $$
declare
  existing_constraint_name text;
begin
  select con.conname into existing_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'documents'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%document_type%'
  limit 1;

  if existing_constraint_name is not null then
    execute format('alter table public.documents drop constraint %I', existing_constraint_name);
  end if;
end $$;

alter table public.documents
  add constraint documents_document_type_check check (
    document_type in (
      '10th Marksheet', '12th Marksheet', 'Graduation Certificate',
      'Category Certificate', 'Domicile Certificate', 'Identity Document',
      'Photo', 'Signature', 'Other'
    )
  );
