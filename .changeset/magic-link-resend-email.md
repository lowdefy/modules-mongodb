---
"@lowdefy/modules-mongodb-user-account": patch
---

Resend link on the login and sign-up "check your email" screens sends a new link to the same address. Before, it failed every time with "We couldn't send your sign-in link", because the address was no longer read once the email field was hidden.
