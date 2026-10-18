"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearParserMaintenanceAction, recheckSourceAction, retryDeliveriesAction, retryPublishAction, setSourceEnabledAction,
} from "@/lib/actions/automation-admin";
import type { OpResult } from "@/lib/automation/ops";

// Buttons only trigger server actions; every one of them re-checks admin
// access on the server, so hiding/showing them here is purely cosmetic.

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OpResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<OpResult>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setResult(null);
    setBusy(label);
    startTransition(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult({ ok: false, message: "Something went wrong. Please try again." });
      } finally {
        setBusy(null);
        router.refresh();
      }
    });
  }
  return { pending, result, busy, run };
}

const BTN = "h-9 rounded border border-hairline bg-paper-raised px-3 text-sm font-medium text-ink hover:bg-paper-sunk disabled:opacity-50";

function Result({ result }: { result: OpResult | null }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`mt-2 text-sm ${result.ok ? "text-eligible-fg" : "text-ineligible-fg"}`}>
      {result.message}
    </p>
  );
}

export function SourceActions({ sourceId, enabled, needsMaintenance }: { sourceId: string; enabled: boolean; needsMaintenance: boolean }) {
  const { pending, result, busy, run } = useAction();
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} disabled={pending || !enabled || needsMaintenance}
          onClick={() => run("check", () => recheckSourceAction(sourceId))}>
          {busy === "check" ? "Checking…" : "Check now"}
        </button>
        <button type="button" className={BTN} disabled={pending}
          onClick={() => run("toggle", () => setSourceEnabledAction(sourceId, !enabled),
            enabled ? "Turn this source off? Existing published information stays as it is; only future checks stop." : undefined)}>
          {busy === "toggle" ? "Saving…" : enabled ? "Turn off" : "Turn on"}
        </button>
        {needsMaintenance && (
          <button type="button" className={BTN} disabled={pending}
            onClick={() => run("clear", () => clearParserMaintenanceAction(sourceId),
              "Only clear this flag after the parser has been fixed. The next check will re-read the page. Continue?")}>
            {busy === "clear" ? "Saving…" : "Parser fixed – clear flag"}
          </button>
        )}
      </div>
      <Result result={result} />
    </div>
  );
}

export function RetryPublishButton({ updateId }: { updateId: string }) {
  const { pending, result, busy, run } = useAction();
  return (
    <div className="mt-2">
      <button type="button" className={BTN} disabled={pending} onClick={() => run("publish", () => retryPublishAction(updateId))}>
        {busy === "publish" ? "Retrying…" : "Retry publish"}
      </button>
      <Result result={result} />
    </div>
  );
}

export function RetryDeliveriesButton({ disabled }: { disabled: boolean }) {
  const { pending, result, busy, run } = useAction();
  return (
    <div className="mt-3">
      <button type="button" className={BTN} disabled={pending || disabled} onClick={() => run("deliveries", () => retryDeliveriesAction(),
        "Retry failed email deliveries now? Permanent failures (bad address, bounces) are skipped.")}>
        {busy === "deliveries" ? "Retrying…" : "Retry failed deliveries"}
      </button>
      <Result result={result} />
    </div>
  );
}
