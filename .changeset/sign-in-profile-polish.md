---
"@lowdefy/modules-mongodb-user-account": patch
---

Sign-in and profile page polish:

- Under `policy: pinned` the accept page names the app by its display name (the app's `name`) instead of the organization's slug. Under `tenant` it keeps the inviting organization's name.
- The accept page's inviter card uses neutral fill and text colours, so it stays readable when the app's primary colour is very dark.
- The "Check your email" screen no longer says the link and code expire "in a few minutes", which contradicted the email when the app sets a longer lifetime.
- The profile page's Security card shows an Email link row when the app signs in by email link, so a passwordless account no longer sees an empty Sign-in heading.
