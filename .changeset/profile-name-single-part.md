---
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-user-account": patch
"@lowdefy/modules-mongodb-user-admin": patch
---

**A profile with only a given name or only a family name keeps its name.** The shared profile derivation set `profile.name` only when both parts were present, so a person with one name part was stored with a null name and, by the unnamed-profile rule, no `picture`; they showed as the person icon with no name. `profile.name` is now the non-empty parts joined by a space, and is null only when both are empty. Initials are the first letter of each part when both are set, otherwise the first two letters of the part that is set. The fix applies on each person's next profile write through any of the three seams.
