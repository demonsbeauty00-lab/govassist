import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseResendEvent, verifySvixSignature } from "@/lib/notifications/engine/webhook";
import { supabaseEngineStore } from "@/lib/notifications/engine/supabase-store";
import { applyProviderEvent } from "@/lib/notifications/engine/delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resend delivery webhook. The ONLY place a delivery can become "delivered".
 * Rejects everything unless the Svix signature verifies against
 * RESEND_WEBHOOK_SECRET (no secret configured = endpoint refuses all calls).
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });

  const body = await request.text();
  const ok = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    body,
  });
  if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "Bad payload." }, { status: 400 }); }

  const outcome = parseResendEvent(payload);
  if (outcome.kind === "ignore") return NextResponse.json({ ok: true });

  await applyProviderEvent(supabaseEngineStore(createAdminClient()), outcome);
  return NextResponse.json({ ok: true });
}
