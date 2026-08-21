---
"@lowdefy/modules-mongodb-user-account": patch
---

**Cleaned up the error messages when adding a passkey.** If your passkey was added successfully but the follow-up screen refresh failed, the page wrongly told you the passkey couldn't be added — right after confirming it was. That misleading message no longer appears: once a passkey registers, only the "Passkey added" confirmation shows, on both the account security page and the two-factor setup page. Failures while registering the passkey itself (for example, cancelling the device prompt) still show a single clear message instead of two stacked ones.
