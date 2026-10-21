---
"@lowdefy/modules-mongodb-user-account": patch
---

Pressing "Accept and continue" on an invitation now goes straight into the app. Before, the accept page reloaded itself partway through and stopped on "You're already a member" until the invitee pressed "Go to app". Accepting makes the invitee a member, and the page called the join log before it refreshed its session, so Lowdefy saw the call answered as a different caller and reloaded the page. The page now refreshes the session first, on the accept path and on a retry of an already-accepted invitation.
