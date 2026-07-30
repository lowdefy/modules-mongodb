---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-contacts": minor
---

**`profile.picture` is now derived by the write, not by the form.** It was previously generated client-side by whichever edit form remembered a `generate_avatar` step before its `CallAPI`. Four of the seven write paths never did — so anyone who came through onboarding, an operator profile edit, or an invite had no avatar at all — and the three that did could go stale, because a rename that didn't pass through a colour picker recomputed `profile.name` server-side and left `picture` on the old initials.

`profile.name` was already server-derived at every write seam. `picture` has identical inputs, so it now follows the same rule: one shared derivation (`modules/shared/profile/derive-profile.js.njk`) is called by all three seams — the shared `write-profile` fragment, `create-contact` and `update-contact`.

What changes for consumers:

- **A payload's `profile.picture` is ignored.** Every seam recomputes it. A consumer posting a picture directly is silently overridden. Renames now update the avatar on every path, including `user-admin`'s profile modal, which has no picker at all.
- **Colour selection moved into the same derivation** and is stored. A profile with no `avatar_color` gets one random palette entry, persisted so it stays stable; an explicit pick from the "Change colour" button still wins. Existing people with a stored colour keep it — including the fixed default that onboarding used to seed. Those without one are recoloured **on their next write, not at upgrade time**, because the rendered avatar is stored too. A palette change therefore does not migrate existing people; clearing `profile.avatar_color` in a migration is the escape hatch. See `docs/shared/avatar-colors.md`.
- **A profile with no name carries no `picture`.** The Avatar block's person icon renders instead of initials reading `?`, which claimed an identity the invitee had not supplied yet. The seam derives a real avatar on the write that first supplies a name.
- **`create-contact` mints the contact `_id` server-side, and a payload's `_id` is ignored.** This closes a write-authorization gap: the de-duplication guard matched on `lowercase_email`, so a payload carrying a _known_ `_id` with a _novel_ email walked past it and the upsert overwrote that contact's `email`, `profile` and `global_attributes`. Contact ids appear in page URLs, so a target could be obtained by observation. Consumers must read the created id off the response's `contactId` — both in-repo callers already do. The old behaviour is not preserved behind a flag. This also fixes a null-`contactId` redirect that a matched upsert could return.
- **`contacts`' create and edit forms no longer show an avatar preview.** Neither form had a colour picker, so the preview was a circle the author could not influence, and on the edit page it duplicated the page-title avatar directly above it. The stored avatar is visible on the contact's pages immediately after save.

Every payload-derived value these pipeline stages inject into MongoDB is now wrapped in `$literal`. In aggregation-expression context a string beginning with `$` reads as a field path, so a `given_name` of `$email` previously stored the contact's email address instead of the name — and `$` is legal in an email local-part, so the same held for `email` and for arbitrary `global_attributes` values.

`request_stages.write` is unaffected: a consumer's stages still run last, so a stage that overrides `profile.name` or `profile.picture` still wins.

The shared `write-profile` fragment gains one **required** `_ref` var, `avatar_colors` — the gradient palette. Every splice site must pass it; all three in-repo callers do. Consumers splicing the fragment themselves need to add it.
