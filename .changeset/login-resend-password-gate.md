---
"@lowdefy/modules-mongodb-user-account": patch
---

**The login page no longer builds a resend-verification button it can never show.** The "Resend verification email" button on the unverified-email wall only appears after a failed password sign-in, so apps with password sign-in turned off now leave it out entirely. This also clears a build warning about an unknown `login_resend_email` state key in magic-link-only apps.
