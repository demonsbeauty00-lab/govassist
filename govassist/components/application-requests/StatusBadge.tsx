import { Badge } from "@/components/ui/Badge";
import { STATUS_LABEL, type RequestStatus } from "@/lib/application-requests/constants";

const TONE: Record<RequestStatus, "neutral" | "positive" | "warning" | "negative" | "brand"> = {
  submitted: "brand",
  under_review: "brand",
  waiting_for_user: "warning",
  in_progress: "brand",
  completed: "positive",
  rejected: "negative",
  cancelled: "neutral",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
