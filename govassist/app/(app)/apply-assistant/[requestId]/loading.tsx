import { AppShell } from "@/components/layout/AppShell";
import { ListSkeleton } from "@/components/ui/Skeleton";

export default function ApplicationRequestDetailLoading() {
  return (
    <AppShell title="Request details" showBack>
      <ListSkeleton count={3} />
    </AppShell>
  );
}
