---
"@lowdefy/modules-mongodb-plugins": minor
---

**New `SupportContext` block and error recorder.** When the plugin's blocks load, a recorder on `window` starts keeping the tab's last 20 `console.error` calls, uncaught errors and unhandled rejections, in memory only. The `SupportContext` block renders nothing; its `snapshot` method sets its value to the page URL, user agent, viewport, screen, locale, time zone and those errors, and fires `onSnapshot`, for a support form to send with a ticket. See `docs/plugins/support-context.md`.
