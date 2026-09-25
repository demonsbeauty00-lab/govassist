import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CheckCircleIcon, AlertIcon, UploadIcon } from "@/components/ui/Icons";
import { DocumentType, DOCUMENT_TYPE_SLUGS } from "@/lib/document-types";

type Status = "not_uploaded" | "processing" | "needs_review" | "verified";

const statusConfig: Record<Status, { label: string; tone: "positive" | "warning" | "neutral"; icon: React.ComponentType<{ className?: string }> }> = {
  verified: { label: "Verified", tone: "positive", icon: CheckCircleIcon },
  needs_review: { label: "Needs review", tone: "warning", icon: AlertIcon },
  processing: { label: "Processing", tone: "neutral", icon: AlertIcon },
  not_uploaded: { label: "Not uploaded", tone: "neutral", icon: UploadIcon },
};

export function DocumentCard({ documentType, status }: { documentType: DocumentType; status: Status }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Link href={`/documents/${DOCUMENT_TYPE_SLUGS[documentType]}`}>
      <Card interactive className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-paper-sunk text-ink-muted">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{documentType}</p>
        </div>
        <Badge tone={config.tone}>{config.label}</Badge>
      </Card>
    </Link>
  );
}
