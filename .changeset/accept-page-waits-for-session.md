---
"@lowdefy/modules-mongodb-user-account": patch
---

An invitee who signs in from the accept page now lands on it signed in, rather than being offered sign-in again. Under `policy: pinned` the server does not resolve an invitee who has not accepted yet, so the page read the caller as signed out whenever the browser's session had not loaded by the time it chose what to show. It now waits for the session before choosing. This affected sign-in by link and by code alike, intermittently.
