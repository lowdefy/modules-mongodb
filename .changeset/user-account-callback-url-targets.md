---
"@lowdefy/modules-mongodb-user-account": patch
---

**Corrected the `callbackUrl` targets across the auth pages.** Four separate faults, each resolving to a wrong or missing post-auth destination:

- **`login`** — email/password and passkey sign-in passed `callbackUrl` as a path string. Lowdefy's `callbackUrl` is a structured `{ home, pageId, url, urlQuery }` target and ignores a non-object, so a direct visit to the login page — a bookmark, a typed URL, a link from signup — signed the user in and left them sitting on the live form. Both now pass no `callbackUrl` at all and let the engine resolve it: the inbound `?callbackUrl=`, else the app home.
- **`signup` / `verify-email`** — the verification-email destination was a concatenated path string, dropped for the same reason, so the emailed link never reached the `verify-email` success render. Now a structured `{ pageId, urlQuery }` target, which also gets `basePath` handling for free.
- **`accept`** — the `?callbackUrl=` written for the login page was rebuilt from the page id and so omitted `basePath`, which matters because the engine consumes that query value raw. It now carries the live `_location` pathname and search, matching what the engine's own unauthenticated redirects emit.
- **`two-factor`** — the post-verify continue handed an app-relative path to the `Link` action's `url`, which is an _external_ target: Lowdefy prefixes `https://` to a scheme-less value, so `/reports` resolved to `https://reports/` and sent the user off-site after completing 2FA. It now builds an origin-absolute URL, falling back to `home: true` when there is no inbound callback.
