---
"@lowdefy/modules-mongodb-user-account": minor
---

An app can now use its own sign-in page everywhere. Setting the new `sign_in_page_id` var to the page id of the app's sign-in page sends the module's links back to sign-in there: "Create account" and "Sign in and accept" on an invitation, "Sign in again" after signing out, "Back to sign in" on the magic-link, verify-email, forgot- and reset-password pages, and the two-factor challenge when its cookie has lapsed. Before, those links always opened the module's own login page, so an app that set `auth.authPages.signIn` to a page of its own still showed people two different sign-in pages. Unset, the links go to the module's login page as before.
