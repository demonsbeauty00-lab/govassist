// The pure rule behind every admin check. Fails closed: anything other than a
// confirmed row in the `admins` table (read through the caller's OWN session,
// so RLS limits it to their own row) is "no access" — a lookup error, a missing
// row and a missing user all look the same to the caller.

export const NO_ADMIN_ACCESS_MESSAGE = "You don't have access to this.";

export type AdminDecision = { ok: true; userId: string } | { ok: false; error: string };

export function decideAdminAccess(input: { userId: string | null | undefined; adminRow: { user_id: string } | null | undefined; lookupFailed?: boolean }): AdminDecision {
  if (!input.userId || input.lookupFailed || !input.adminRow) return { ok: false, error: NO_ADMIN_ACCESS_MESSAGE };
  // The row must be the caller's own — never trust a row that belongs to someone else.
  if (input.adminRow.user_id !== input.userId) return { ok: false, error: NO_ADMIN_ACCESS_MESSAGE };
  return { ok: true, userId: input.userId };
}
