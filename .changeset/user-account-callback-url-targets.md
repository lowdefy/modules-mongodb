---
"@lowdefy/modules-mongodb-user-account": patch
---

**Corrected the `callbackUrl` targets across the auth pages.** Four faults, each resolving to a wrong or missing post-auth destination:

- **`signup` / `verify-email`** — the verification-email destination was a concatenated path string. `callbackUrl` is a structured `{ home, pageId, url, urlQuery }` target and Lowdefy discards a non-object, so the emailed link never reached the `verify-email` success render — BetterAuth fell back to its own `basePath`-less `/`. Now a structured `{ pageId, urlQuery }` target, which also picks up `basePath` handling.
- **`accept`** — the `?callbackUrl=` written for the login page was rebuilt from the page id and so omitted `basePath`, which matters because the engine consumes that query value raw (its own producers bake `basePath` in). It now carries the live `_location` pathname and search.
- **`two-factor`** — the post-verify continue handed an app-relative path to the `Link` action's `url`, which is an _external_ target: Lowdefy prefixes `https://` to a scheme-less value, and URL parsing then promotes the first path segment to the hostname, so `/reports` resolved to `https://reports/`. Every 2FA completion navigated off-site, or failed outright on the `"/"` fallback. It now builds an origin-absolute URL, falling back to `home: true` when there is no inbound callback.
