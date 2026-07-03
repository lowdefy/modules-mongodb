---
'@lowdefy/modules-mongodb-notifications': minor
---

Accept Lowdefy framework notification links on the `link` page. Lowdefy's built-in `notifications:` config section (Lowdefy ≥ 5.4) composes email links as `?_id=<record>&option=<dataPath>`, where `option` is a dot-path into the record's `data` (e.g. `links.button`, `actions.0.link`). The link page now resolves the redirect target from `data` at the `option` path, falling back to the legacy top-level `links.button` for Lambda-produced records, and follows absolute URL targets directly. Set `app.notificationLandingPage: /notifications/link` in the consuming app to route framework notification emails through this page for mark-as-read tracking; leave it unset and framework email links go directly to their target pages.

The inbox list also falls back to the framework record's `preview` field when `description` is absent, so framework-created notifications render in the inbox without changes.
