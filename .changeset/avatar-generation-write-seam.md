---
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-plugins": minor
---

**Breaking: the profile name and avatar are derived on the server when a profile is written.** `contacts`' `create-contact` and `update-contact`, and the shared `write-profile` fragment that `user-account` and `user-admin` use, all call one derivation (`modules/shared/profile/derive-profile.js.njk`). It sets `profile.name`, `profile.avatar_color` and `profile.picture`.

- **A payload's `profile.picture` is ignored.** The write computes it, so renames update the avatar on every path. The contacts create and edit forms do not render an avatar preview.
- **`profile.name` is the non-empty given and family names joined by a space**, so a person with only one name part keeps their name. Initials are the first letter of each part, or the first two letters of the only part.
- **A profile with no `avatar_color` is given one random palette entry, and it is stored** so it stays stable. Picking a colour still wins, and people who already have a stored colour keep it. Because the rendered avatar is stored too, existing people are recoloured on their next write, not at upgrade. To recolour everyone, clear `profile.avatar_color` in a migration. See `docs/shared/avatar-colors.md`.
- **A profile with no name stores no `picture`**, so the Avatar block shows its person icon.
- **Profile photos.** The new `AvatarUpload` plugin block is a round avatar that is also the upload control. It crops, downscales and compresses the image in the browser to a data URI, which is stored inline. The shared avatar picker (onboarding and the profile modals) binds it to `profile.photo`, and an uploaded photo becomes the stored `profile.picture`. Removing the photo goes back to the initials avatar. `update-profile` rejects a photo that is not an image data URI or is over about 512 KB.
- **`create-contact` mints the contact `_id` on the server and ignores a payload `_id`.** Read the new id from the response's `contactId`. A payload carrying a known `_id` with a new email could otherwise overwrite that contact.
- **Every payload value these writes put into an aggregation update is wrapped in `$literal`**, so a value that begins with `$` (a `given_name` of `$email`, or an email local part) is stored as written instead of being read as a field path.

`request_stages.write` stages still run last, so a stage that overrides `profile.name` or `profile.picture` still wins.
