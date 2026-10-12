import { notFound } from "next/navigation";
import { AdminRequestDetailClient } from "@/components/admin/AdminRequestDetailClient";
import { getAdminRequestAction } from "@/lib/actions/application-requests-admin";

export const dynamic = "force-dynamic";

export default async function AdminApplicationRequestDetailPage({ params }: { params: { requestId: string } }) {
  const detail = await getAdminRequestAction(params.requestId);
  // Non-admins and unknown ids both get a 404 — no hint a request exists.
  if (!detail) notFound();

  return (
    <div className="app-shell min-h-screen px-4 py-6 md:mx-auto md:max-w-4xl">
      <a href="/admin/application-requests" className="text-sm font-medium text-brand-600 underline">← All requests</a>
      <AdminRequestDetailClient detail={detail} />
    </div>
  );
}
