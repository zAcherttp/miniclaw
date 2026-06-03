---
name: recipe-block-focus-time
description: "Create focus time blocks on Google Calendar to protect deep work hours."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "scheduling"
---

# Block Focus Time on Google Calendar

Create focus time blocks on Google Calendar to protect deep work hours.

## Steps

1. **Check Existing Schedule**: Run the `manage_calendar` tool with `action: "list"` and `timeRange: "week"` to find the best times for deep work.
2. **Book a Focus Block**: Call `manage_calendar` with `action: "create"`, setting `summary: "Focus Time"`, `description: "Protected deep work block"`, `start`, and `end` timestamps for your blocked focus hours.
3. **Verify the Block**: Call `manage_calendar` with `action: "list"` and `timeRange: "today"` to verify the slot is successfully booked.
