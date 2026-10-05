---
"@lowdefy/modules-mongodb-user-account": patch
---

A new user's sign-in link now lands on the app home instead of the onboarding page, so the app's router places them. Under the tenant policy, an invited person who signed in from the login page rather than from their invitation holds no organisation yet, and the onboarding page showed them a 404. A tenant app's router sends such a caller (`_user.awaiting_organization`) to the accept page with their `_user.pending_invitation_id`; the tenant demo's router shows how.
