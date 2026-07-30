---
"@lowdefy/modules-mongodb-layout": patch
---

**The notifications bell no longer fires its request for anonymous callers.** The notifications connection is tenant-walled, so a caller with no organization failed closed — a loud `AuthenticationError` on every public page, including login. The bell is meaningless when logged out, so the request now skips on a null `_user: id` instead of erroring.
