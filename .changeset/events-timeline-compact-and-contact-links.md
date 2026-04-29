---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-events": patch
---

Improve the `EventsTimeline` block and `events-timeline` component:

- **New block properties**: `compact` (boolean, default `false`) renders smaller avatars and tighter padding, and applies an `events-timeline-compact` class on the root for additional dense styling; `contactPageUrl` (string) is a URL template for linking each user avatar and timestamp to a contact page, supporting `{id}` substitution and falling back to appending `?_id=<userId>`; `disableContactLink` (boolean, default `false`) opts out of the contact-page wrapping per call. Avatars are also wrapped in a Popover showing the user's name on hover.
- **Component vars**: the `events-timeline` component exposes the new properties via `contact_page_url` module var and per-call `_var` overrides (`contact_page_url`, `disable_contact_link`, `compact`). All defaults are off, so existing consumers see no change.
- **Fix: `get-events` request never fired** because the component declared the request but had no `onMount` Request action to trigger it. Added the trigger.
- **Fix: Avatar didn't render** for events without a description — the React `EventTimelineItem` only included `<Avatar>` inside the `EventDescription` branch. Restructured so the title-only branch also renders the avatar.
