---
"@logto/core": minor
---

add `addedUserIds`/`removedUserIds` delta fields to organization membership webhooks

Membership change events now report which users or applications were added or removed
(`addedUserIds`, `removedUserIds`, `addedApplicationIds`, `removedApplicationIds`), each
omitted when empty and capped at 5000 entries.
