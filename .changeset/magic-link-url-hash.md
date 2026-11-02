---
"@lowdefy/modules-mongodb-user-account": minor
---

**The magic-link page reads the sign-in token from the URL fragment.** Lowdefy now puts the token in the link's fragment (`#token=…`), which browsers never send, so it stays out of request logs. The page checks the fragment with `_url_hash`, then the query, so links emailed before the upgrade still sign in. Needs the Lowdefy release with `_url_hash` (lowdefy/lowdefy#2848); upgrade Lowdefy first.
