---
"@lowdefy/modules-mongodb-notifications": minor
---

**A notification link can sign its recipient in.** With the new `sign_in_token` var on, the link page reads a `token` from its URL: a sign-in token the app minted for that link with Lowdefy's `CreateSignInToken` step. A signed-out recipient sees one button (`sign_in_token_label`, "Open in the app" by default); tapping it trades the token for a session with `SignInWithToken` and lands on the item the token was minted for, with no second sign-in email. Nothing is exchanged when the page loads, so a mail scanner that fetches the link spends nothing. A token that is used, expired, revoked or for another organisation falls back to the ordinary sign-in and keeps the target. A signed-in recipient follows the link as before. Off by default, so apps that mint no tokens see no change. Needs a Lowdefy release with sign-in tokens (lowdefy/lowdefy#2808).
