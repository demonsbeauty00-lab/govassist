import { describe, it, expect } from "vitest";
import { categoryLabelFor, countUnread, markRead, toNotificationItem, type NotificationRowInput } from "../inbox";

const row = (over: Partial<NotificationRowInput> = {}): NotificationRowInput => ({
  id: "n1", title: "T", body: "B", type: "system", is_read: false, created_at: "2026-10-01T00:00:00Z",
  event_type: null, link_url: null, organization: null, source_url: null, published_on: null, ...over,
});

describe("inbox helpers", () => {
  it("counts unread and marks one or all as read", () => {
    const items = [toNotificationItem(row({ id: "a" })), toNotificationItem(row({ id: "b" })), toNotificationItem(row({ id: "c", is_read: true }))];
    expect(countUnread(items)).toBe(2);
    expect(countUnread(markRead(items, ["a"]))).toBe(1);
    expect(countUnread(markRead(items, "all"))).toBe(0);
    expect(items[0]?.isRead).toBe(false); // original untouched
  });
  it("drops an unsafe link even if one reached the row", () => {
    expect(toNotificationItem(row({ link_url: "https://evil.example" })).linkUrl).toBeNull();
    expect(toNotificationItem(row({ link_url: "/apply-assistant/x" })).linkUrl).toBe("/apply-assistant/x");
  });
  it("labels by event, falling back to the legacy type for old rows", () => {
    expect(categoryLabelFor({ eventType: "ADMIT_CARD_AVAILABLE", legacyType: "admit_card" })).toBe("Admit card");
    expect(categoryLabelFor({ eventType: null, legacyType: "deadline" })).toBe("Deadline");
    expect(categoryLabelFor({ eventType: "SOMETHING_UNKNOWN", legacyType: "result" })).toBe("Result");
  });
  it("carries the delivery state only when one exists", () => {
    expect(toNotificationItem(row()).emailStatus).toBeNull();
    expect(toNotificationItem(row(), "sent").emailStatus).toBe("sent");
  });
});
