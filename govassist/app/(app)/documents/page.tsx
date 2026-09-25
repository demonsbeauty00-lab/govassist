import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { LockIcon } from "@/components/ui/Icons";
import { getDocumentsAction } from "@/lib/actions/documents";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { DocumentType } from "@/lib/document-types";

export default async function DocumentsPage() {
  const result = await getDocumentsAction();

  if (result.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  return (
    <AppShell title="Documents">
      <div className="mt-2 flex items-start gap-3 rounded border border-hairline bg-paper-raised p-3.5">
        <LockIcon className="mt-0.5 shrink-0 text-brand-600" />
        <p className="text-sm text-ink-muted">
          Your documents are private, stored securely, and only ever accessed through
          time-limited links — never a public URL. They're only used to fill forms or
          check eligibility when you give permission.
        </p>
      </div>

      <div className="mt-4">
        {result.error ? (
          <ErrorState description={result.error} />
        ) : (
          <div className="space-y-3">
            {result.documents.map((doc) => (
              <DocumentCard key={doc.document_type} documentType={doc.document_type as DocumentType} status={doc.status} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
