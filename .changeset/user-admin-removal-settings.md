---
"@lowdefy/modules-mongodb-user-admin": minor
---

**Remove from app and Delete login can be switched off.** Two new vars, `remove_member` and `delete_user`, each default `true`. When one is `false`, the view page's Security tile renders no button or tooltip for that action, the page leaves out its confirm modal, and its endpoint (`remove-member` or `delete-user`) rejects as its first step, so a caller who reaches it directly deletes nothing. The endpoints stay registered. Use them in an app whose people carry history or settings on their member or user rows, where removing the member row drops the person's roles and member attributes and deleting the login cuts records keyed on the user id off from the person. Suspend and Reinstate are unaffected. With the vars left out, behaviour is unchanged.
