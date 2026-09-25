import { AlertIcon } from "@/components/ui/Icons";

export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <AlertIcon className="text-ineligible-fg" />
      <p className="mt-3 text-[17px] font-semibold text-ink">Configuration needed</p>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">{message}</p>
      <p className="mt-4 text-xs text-ink-faint">
        This message only appears to developers running the app without environment
        variables set — end users would never reach a misconfigured deployment.
      </p>
    </div>
  );
}
