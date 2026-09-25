import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { UploadIcon } from "@/components/ui/Icons";

export default function ApplyAssistantPage() {
  return (
    <AppShell title="Apply Assistant" showBack>
      <div className="mt-6">
        <EmptyState
          icon={<UploadIcon />}
          title="Coming soon"
          description="Apply Assistant will help auto-fill official application forms from your saved profile and documents. It isn't built yet — this page exists so the link isn't broken while it's in progress."
        />
      </div>
    </AppShell>
  );
}
