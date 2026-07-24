---
"@lowdefy/modules-mongodb-notifications": minor
---

**Notifications module now declares its own public pages.** The `link`, `invalid`, and `file-download` pages are unauthenticated by design — `link` resolves auth-less event types for recipients who aren't logged in, `invalid` is its error page, and `file-download` is a capability-URL attachment redirector (matched by notification id, no session). The manifest previously carried no `auth` block, so every consuming app had to hand-list these scoped page ids in its own `auth.pages.public` — and silently broke the flows if it missed one.

The manifest now contributes `auth.public: [link, invalid, file-download]`, so any app embedding the module gets them public automatically (app config still wins on collision). The inbox (`all`) stays protected.
