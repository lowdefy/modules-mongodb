---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

ai-assistant: follow a scope that changes mid-session, and recolour the composer

- `enter` now notices when the `scope` var no longer matches the scope the open thread belongs to, drops that thread and its list, and resumes in the new scope. Apps with an active-company or active-record switcher no longer need their own reset on every visit. A page hosting `embedded` should splice `enter` into `onMount` as well as `onInit`.
- New `sender` var, merged over the chat's composer properties, so the composer's `styles` and `classNames` can be set. Together with `styles` under `message_display.roles`, this recolours the chat without `!important` (Lowdefy 6.1 or later).
