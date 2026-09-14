---
"@lowdefy/modules-mongodb-user-account": patch
---

**Sign-in links no longer get used up before they reach the recipient, and a code in the same email is now an alternative to clicking.** Corporate mail security scanners open every link in a message as it is delivered, and a sign-in link works exactly once — so people were arriving at "this link has expired" on a link they had never clicked. The emailed link now opens a page with a single **Sign in** button, and only that click completes sign-in; nothing happens automatically, which is what keeps a scanner from spending the link. A link that has genuinely expired or already been used still returns to the sign-in page with the usual notice.

Where the app turns on email codes, the "check your email" screen also takes the short code from the same email — useful when the mail client strips links, or the email was opened on another phone. Getting the code wrong shows a message and leaves you on the screen to try again or resend, and an account with two-factor authentication is still asked for its second factor.
