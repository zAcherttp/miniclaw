---
name: recipe-find-free-time
description: "Query calendar free/busy status for attendees to find a meeting slot."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "scheduling"
---

# Find Free Time Across Calendars

Query calendar free/busy status to find an optimal meeting slot.

## Steps

1. **Check Schedule**: Call the `manage_calendar` tool with `action: "list"`, setting `timeRange: "week"` or a specific number of `days` to view existing schedules.
2. **Identify Gaps**: Review the returned list of events to identify open slots where no conflicting bookings exist.
3. **Book the Event**: Call `manage_calendar` with `action: "create"`, specifying the `summary`, `start` and `end` times matching the discovered open slot, and providing the list of invitees in `attendees`.
