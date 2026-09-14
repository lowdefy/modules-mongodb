---
"@lowdefy/modules-mongodb-events": patch
"@lowdefy/modules-mongodb-files": patch
---

**Change stamps and upload policies read the caller's display name from `user.name` first.** `user.name` is the engine's top-level display copy; these reads went straight to `profile.name`, which is unset for a caller whose session predates that copy — so the stamped name fell through to the generic default. `profile.name` is kept as the fallback.
