---
name: recipe-reschedule-meeting
description: "Move a calendar event to a new time and notify attendees."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "scheduling"
---

# Reschedule a Calendar Meeting

Move a calendar event to a new time and update its details seamlessly.

## Steps

1. **Find the Event**: Call the `manage_calendar` tool with `action: "list"` to search for the event and retrieve its details.
2. **Update the Time**: Call `manage_calendar` with `action: "update"`, passing the corresponding `eventId`, and providing the new `start` and `end` times.
3. **Confirm the Change**: Run `manage_calendar` with `action: "list"` to confirm the event has been successfully moved to its new slot.
