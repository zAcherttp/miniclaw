---
name: recipe-schedule-recurring-event
description: "Create a schedule holding block on your Calendar with attendees."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "scheduling"
---

# Schedule a Meeting with Attendees

Create a calendar event and invite your team or attendees cleanly.

## Steps

1. **Verify Availability**: Call the `manage_calendar` tool with `action: "list"` to search the schedule and ensure the target time slot is open for all attendees.
2. **Schedule the Meeting**: Call `manage_calendar` with `action: "create"`, providing the `summary` (e.g. "Weekly Sync"), `start` time, `end` time, and specifying invitee emails in the `attendees` array.
3. **Verify Booking**: Call `manage_calendar` with `action: "list"` for the upcoming week to verify the event is correctly created and reflected in your agenda.
