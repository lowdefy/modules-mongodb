---
"@lowdefy/modules-mongodb-user-account": patch
---

A banned user who tries to sign in is now told their access was removed. Before, the login page had no message for a ban: a sign-in link landed on "Something went wrong while signing you in", and a correct emailed code toasted "That code is wrong or has expired", so the person kept retrying. A sign-in link or password sign-in now shows the "You don't have access to this app" wall with "Your access to this app has been removed. Contact an administrator if you think this is a mistake." A correct emailed code for a banned user, or for one with no access to the app, toasts the matching message in place of the wrong-code one. A sign-in link reaches the wall once Lowdefy redirects a refused magic-link sign-in to the error page.
