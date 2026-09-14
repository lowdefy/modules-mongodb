---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-user-account": minor
---

Profile photos. New `AvatarUpload` block in `@lowdefy/modules-mongodb-plugins`: a round avatar that is itself the upload control — the picked image is center-cropped, downscaled and compressed client-side to a data URI under a byte cap, so it stores inline on the contact. The shared `avatar-picker` row (onboarding page and profile edit modal) now renders it bound to `profile.photo`, and the shared write-profile fragment makes an uploaded photo the stored `profile.picture` after the initials derivation (removing the photo falls back to the derived initials avatar on the same write; the `UpdateUserProfile` re-denorm carries it onto `user.image` as before). `update-profile` rejects a photo that is not an image data URI or exceeds ~512 KB. Consumers that persisted the photo through `request_stages.write` themselves can drop those stages.
