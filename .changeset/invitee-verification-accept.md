---
"@lowdefy/modules-mongodb-user-account": patch
---

**A new invitee who signs up with a password returns to the invitation after verifying.** With `requireEmailVerification` on, signup set the verification email's callback to the verify-email page without the `?callbackUrl=` the accept page had sent, so **Continue to sign in** opened login with no destination and the invitee signed in to the app with the invitation still pending. Every verification email the module sends (signup, its resend, the login wall's resend and verify-email's own resends) now carries the inbound `?callbackUrl=`, and verify-email passes it on to login. Signup with no `?callbackUrl=` behaves as before.
