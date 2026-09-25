import { Badge } from "@/components/ui/Badge";
import { NotificationStatus, NOTIFICATION_STATUS_LABEL } from "@/lib/notifications/status";

const tone: Record<NotificationStatus, "positive" | "warning" | "neutral" | "brand"> = {
  new: "brand",
  applications_open: "positive",
  closing_soon: "warning",
  closed: "neutral",
  exam_upcoming: "brand",
  result_released: "positive",
};

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return <Badge tone={tone[status]}>{NOTIFICATION_STATUS_LABEL[status]}</Badge>;
}
