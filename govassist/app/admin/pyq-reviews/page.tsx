import { listPendingPapersAction } from "@/lib/actions/pyq-admin";
import { PyqAdminReviewClient } from "@/components/admin/PyqAdminReviewClient";

export const dynamic = "force-dynamic";

export default async function PyqAdminReviewsPage() {
  const result = await listPendingPapersAction();

  return (
    <div className="app-shell min-h-screen px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-ink">PYQ papers — pending review</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Ingested papers that need a human check before they become part of the real PYQ library, plus a manual
        import tool for admin-verified papers.
      </p>
      <a href="/admin/reviews" className="mt-2 inline-block text-sm font-medium text-brand-600 underline">
        ← Official update reviews
      </a>

      {result.error ? (
        <p className="mt-6 text-sm text-ineligible-fg">{result.error}</p>
      ) : (
        <div className="mt-6">
          <PyqAdminReviewClient initialPapers={result.papers} />
        </div>
      )}
    </div>
  );
}
