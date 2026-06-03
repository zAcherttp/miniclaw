---
name: recipe-create-task-list
description: "Set up a new task checklist to track your execution goals."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "productivity"
---

# Create a Task List and Add Tasks

Set up a new stateful todo checklist in the workspace to plan and track your execution goals.

## Steps

1. **Plan & Draft Tasks**: Call the `write_todos` tool passing an array of `todos` with unique `id`s, clear actionable descriptions (`text`), and `status: "pending"`.
2. **Add or Append Tasks**: Call `write_todos` with your updated complete array containing additional subtasks as needed.
3. **Verify and Update Status**: Mark tasks as `"done"`, `"blocked"`, or `"cancelled"` as work progresses by calling `write_todos` with the updated list of todos.
