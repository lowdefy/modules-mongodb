---
"@lowdefy/modules-mongodb-user-account": patch
---

Pressing Enter in a sign-in field now does what the page's main button does. On the login page, Enter in the email field sends the sign-in link (or, with passwords enabled, opens the password form and then signs in), and Enter in the password field signs in. The same works on the sign-up, forgot-password and reset-password pages and on the password step of two-factor setup. Enter respects the 30-second wait between sign-in link sends, like the button does.
