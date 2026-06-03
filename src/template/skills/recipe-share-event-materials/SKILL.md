---
name: recipe-share-event-materials
description: "Coordinate event information and share materials with all attendees of a calendar event."
metadata:
  version: 1.0.0
  openclaw:
    category: "recipe"
    domain: "productivity"
---

# Coordinate Materials with Meeting Attendees

Prepare event information and share description/materials with all attendees of a calendar event.

## Steps

1. **Get Event Details & Attendees**: Call the `manage_calendar` tool with `action: "list"` to retrieve details of the target event, including the list of invited emails in `attendees`.
2. **Update Event with Materials**: Add links to documents or meeting materials in the event body by calling `manage_calendar` with `action: "update"`, specifying `eventId`, and providing the updated description in `description`.
3. **Verify Event Details**: Run `manage_calendar` with `action: "list"` to verify that the materials and links are clearly published to the event details for all attendees to access.
