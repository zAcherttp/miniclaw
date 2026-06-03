---
name: recipe-review-overdue-tasks
description: "Find overdue reminders and tasks that need attention."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "productivity"
---

# Review Overdue Tasks and Reminders

Find overdue reminders or checklist items that are past their target times and need immediate attention.

## Steps

1. **List All Reminders**: Call the `manage_reminders` tool with `action: "list"` to fetch all scheduled and fired tasks/reminders.
2. **Identify Overdue / Pending Items**: Filter and review the output items that have status `"pending"` or `"fired"`, comparing their `targetTime` against the current system time to identify overdue ones.
3. **Take Action**: Prioritize, complete, or reschedule overdue items. Call `manage_reminders` with `action: "update"` and `id` to mark them as completed (`status: "completed"`) or push them to a new `targetTime`.
