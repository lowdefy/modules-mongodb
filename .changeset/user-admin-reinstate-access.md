---
"@lowdefy/modules-mongodb-user-admin": patch
---

Admins can now reinstate a suspended user from the user detail page. When a user is suspended, the Security tile shows **Reinstate access** in place of Suspend access. It opens a confirm, lifts the ban through the existing `reinstate` endpoint, and refreshes the page so the status goes back to Active. Like Suspend, it sits behind the `suspension` var.
