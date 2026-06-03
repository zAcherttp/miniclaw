---
name: recipe-plan-weekly-schedule
description: "Review your calendar week, identify gaps, and add events to fill them."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "scheduling"
---

# Plan Your Weekly Schedule

Review your upcoming calendar week, identify gaps, and add events to organize your week.

## Steps

1. **Check Weekly Agenda**: Call the `manage_calendar` tool with `action: "list"` and `timeRange: "week"` to check your current schedule.
2. **Add Missing Blocks**: Call `manage_calendar` with `action: "create"` to schedule deep work blocks, weekly syncs, or task deadlines.
3. **Verify Updated Schedule**: Run `manage_calendar` with `action: "list"` and `timeRange: "week"` to confirm the new items are correctly blocked out and conflict-free.
