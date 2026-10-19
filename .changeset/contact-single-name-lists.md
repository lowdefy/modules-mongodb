---
"@lowdefy/modules-mongodb-plugins": patch
"@lowdefy/modules-mongodb-activities": patch
"@lowdefy/modules-mongodb-companies": patch
---

**A contact with one name part is labelled correctly in contact lists.** The `ContactSelector` block's `appendContact` method named a newly created contact by joining the given and family names as written, so a contact with only one of them was added to the selection as `Thandi undefined` or `undefined Nkosi`. It now uses the trimmed non-empty parts joined by a space, and no name when both are empty, in which case the list item shows the email. The activities and companies contact lists, when a contact has no stored picture, now build the initials with the same rule as the shared profile derivation: the first letter of each part when both are set, otherwise the first two letters of the part that is set, and `?` when neither is.
