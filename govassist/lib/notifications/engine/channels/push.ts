// Browser/push ARCHITECTURE ONLY. No push provider (Web Push/VAPID, FCM) is
// implemented, so this channel reports itself as not configured and the
// engine never queues push deliveries. The `push` value exists in
// notification_deliveries.channel so a real sender can be added later by
// implementing Channel and registering it in ../index.ts - nothing else in
// the engine needs to change.

import type { Channel } from "../types";

export const pushChannel: Channel = {
  name: "push",
  isConfigured: () => false,
  wantsChannel: () => false,
  async send() {
    return { ok: false, error: "push is not implemented", permanent: true };
  },
};
