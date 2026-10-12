// Pure authorization predicates. The server actions call these on rows
// they've just loaded, so the rules are unit-testable without a database.
// (RLS is the second, independent layer.)

export interface OwnedRow {
  user_id: string;
}

export function isOwner<T extends OwnedRow>(row: T | null | undefined, userId: string): row is T {
  return !!row && row.user_id === userId;
}

/** Applicants never see internal admin notes or document-view logs. */
export function isVisibleToApplicant(event: { visibility: "user" | "internal" }): boolean {
  return event.visibility === "user";
}

/** Whether `userId` appears in the list of admin user ids. */
export function isAdminUser(adminIds: readonly string[], userId: string): boolean {
  return adminIds.includes(userId);
}
