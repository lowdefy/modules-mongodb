---
"@lowdefy/modules-mongodb-user-account": patch
---

An expired or already-used sign-in link no longer dead-ends. When the app carries a one-time code in its sign-in email (`auth.emailOTP`), the login page reached from an expired link now asks for your email and the code from that same email, with "Email me a new link" as the fallback — so a corporate mail scanner that opens the link before you do costs you nothing. The code entry under "Check your email" is unchanged.
