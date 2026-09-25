import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentDetailClient } from "@/components/documents/DocumentDetailClient";
import { getDocumentByTypeAction } from "@/lib/actions/documents";
import { documentTypeFromSlug } from "@/lib/document-types";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export default async function DocumentDetailPage({ params }: { params: { type: string } }) {
  const documentType = documentTypeFromSlug(params.type);

  if (!documentType) {
    return (
      <AppShell title="Document" showBack>
        <div className="mt-4">
          <EmptyState title="Document not found" description="This document type isn't recognised." />
        </div>
      </AppShell>
    );
  }

  const result = await getDocumentByTypeAction(documentType);

  if (result.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  return (
    <AppShell title={documentType} showBack>
      <DocumentDetailClient documentType={documentType} initialDocument={result.document} />
    </AppShell>
  );
}
