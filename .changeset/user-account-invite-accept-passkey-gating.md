---
"@lowdefy/modules-mongodb-user-account": minor
---

**Invitation accept page now tells you what actually went wrong, and case differences no longer break a valid invite.** The accept page used to lump every non-pending invitation into one generic "expired" message. It now distinguishes an invitation that's past its expiry date, one that was withdrawn or declined, and one sent to a different email address — each with its own explanation, and a "Sign out" button on the wrong-address case so you can switch accounts. The email match is also now case- and whitespace-insensitive, matching the check the auth engine itself performs, so an invite no longer silently fails just because an existing account's email was saved with different casing. Each rejected attempt is now logged server-side so a "this invitation can't be used" report can be diagnosed without reproducing it.

**Passkey sign-in on the login page now asks for an email first.** Passkey itself doesn't need one, but requiring it first means there's an address on hand to fall back to if the authenticator prompt is cancelled. Clicking "Sign in with a passkey" before entering an email shows a reminder instead of starting the ceremony.

**New users can optionally add a passkey during onboarding**, when passkey sign-in is enabled for the app. It's offered, not required — declining just continues to "Save and continue", and a passkey can always be added later from the account's Security settings.
