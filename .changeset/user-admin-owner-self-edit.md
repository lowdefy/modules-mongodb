---
'@lowdefy/modules-mongodb-user-admin': patch
---

user-admin: saving the access modal for an organization owner (including an owner editing their own attributes) failed with "UpdateMemberOrgRole requires an "orgRole" string property". The authority selector is hidden for owners, which prunes its value from state, so the unchanged-tier skip never matched. The tier write is now skipped when there is no value to write.
