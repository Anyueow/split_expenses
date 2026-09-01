import { nanoid } from "nanoid";
import type { ActivityEvent, GroupData } from "../../../src/lib/types";

export const ACTIVITY_LIMIT = 200;

/** Newest first, capped so the blob document can't grow without bound. */
export function pushActivity(data: GroupData, message: string): ActivityEvent {
  const event: ActivityEvent = {
    id: nanoid(),
    groupId: data.group.id,
    message,
    createdAt: new Date().toISOString(),
  };
  data.activity.unshift(event);
  if (data.activity.length > ACTIVITY_LIMIT) {
    data.activity.length = ACTIVITY_LIMIT;
  }
  return event;
}
