import { AppShell } from "@/components/layout/AppShell";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function ApplicationRequestsLoading() {
  return (
    <AppShell title="Application Requests" showBack>
      <ListSkeleton count={3} />
    </AppShell>
  );
}
