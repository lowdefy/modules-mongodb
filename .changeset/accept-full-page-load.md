---
"@lowdefy/modules-mongodb-user-account": patch
---

After accepting an invitation, the app now opens with the menu and home page the new roles grant. The accept page loaded before the invitee was a member, and entering the app with a client-side link kept those empty menus, so the invitee reached only their profile page until they reloaded. Entering the app is now a full page load to home, on the accept path and on a retry of an already-accepted invitation.
