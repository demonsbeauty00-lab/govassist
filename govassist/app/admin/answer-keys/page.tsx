import Link from "next/link";
import { listPublishedPapersAction } from "@/lib/actions/pyq";
import { getPaperResponseSheetUploadsForAdminAction } from "@/lib/actions/answer-key-admin";
import { AnswerKeyAdminClient } from "@/components/admin/AnswerKeyAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminAnswerKeysPage({ searchParams }: { searchParams: { paperId?: string } }) {
  if (!searchParams.paperId) {
    const result = await listPublishedPapersAction();
    return (
      <div className="app-shell min-h-screen px-4 py-6">
        <h1 className="font-display text-xl font-semibold text-ink">Answer keys — pick a paper</h1>
        <p className="mt-1 text-sm text-ink-muted">Select a published paper to submit or review its answer key.</p>
        <div className="mt-4 space-y-2">
          {(result.papers ?? []).map((p) => (
            <Link key={p.id} href={`/admin/answer-keys?paperId=${p.id}`} className="block rounded border border-hairline p-3 text-sm text-ink hover:bg-paper-sunk">
              {p.title}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const uploadsResult = await getPaperResponseSheetUploadsForAdminAction(searchParams.paperId);

  return (
    <div className="app-shell min-h-screen px-4 py-6">
      <Link href="/admin/answer-keys" className="text-sm font-medium text-brand-600 underline">
        ← Pick a different paper
      </Link>
      <h1 className="mt-2 font-display text-xl font-semibold text-ink">Manage answer key</h1>

      {uploadsResult.error ? (
        <p className="mt-4 text-sm text-ineligible-fg">{uploadsResult.error}</p>
      ) : (
        <div className="mt-4">
          <AnswerKeyAdminClient paperId={searchParams.paperId} initialUploads={uploadsResult.uploads} />
        </div>
      )}
    </div>
  );
}
