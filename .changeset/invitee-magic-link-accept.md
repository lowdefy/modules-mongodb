---
"@lowdefy/modules-mongodb-user-account": patch
---

**A new invitee's sign-in link returns them to the invitation.** When a person with no account signs in by magic link from the accept-invitation page, the link now brings them back to the accept page instead of onboarding. Under `policy: tenant` an invitee who has not accepted holds no membership and is refused every protected page, so onboarding answered 404 and the invitation was never accepted. A new user signing in from anywhere else still lands on onboarding.
