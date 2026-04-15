# Review 1 — Completeness and Feasibility

## Cross-Module Scope Issues

### 1. `_module.var: avatar_colors` is only defined in user-account

> **Resolved.** Moved palette to `modules/shared/profile/avatar_colors.yaml`. Each module that needs it defines `avatar_colors` as a module var with `_ref` to the shared default. Module consumers can override per-module.

The palette is defined in `modules/user-account/module.lowdefy.yaml:28-31` with defaults in `modules/user-account/defaults/avatar_colors.yaml`. The design proposes using `_module.var: avatar_colors` for random color selection in contacts and user-admin forms (design lines 180-189), but neither module defines this var.

`_module.var: avatar_colors` will resolve to `undefined` in the contacts and user-admin modules.

**Fix:** Either define `avatar_colors` in each module's `module.lowdefy.yaml` (referencing the same defaults file), or move the palette to a shared location that all modules can access.

### 2. Contacts and user-admin forms have no avatar preview or SetState-on-save

> **Resolved.** All three modules (user-account, user-admin, contacts) now use the same SetState-before-CallApi pattern. Added `form_contact.yaml` to Files Changed. Resolved open question 1.

The design shows the SetState-before-API pattern only for user-account's `form_profile.yaml` (design lines 127-142). But with server-side generation removed, user-admin edit forms and contacts edit forms also need this pattern to regenerate `profile.picture` when names change.

The design's open question (line 266) acknowledges this but leaves it unresolved. This is a required decision -- without it, editing a contact's or user's name through admin won't update their avatar, and the stored `profile.picture` will show stale initials.

**Fix:** Decide and document whether admin/contacts edit forms will: (a) include the same preview + SetState-on-save pattern, or (b) intentionally leave the avatar unchanged until the user edits their own profile.

## Missing Files

### 3. `view_profile.yaml` not in Files Changed

> **Resolved.** Added `view_profile.yaml` to the Display Components table and Files Changed table with fallback needed.

`modules/user-account/components/view_profile.yaml:13-14` renders an `Img` with `src: _user: profile.picture` and has no fallback. If `profile.picture` is null (Decision 5 says new users won't have one), this renders a broken image.

**Fix:** Add `view_profile.yaml` to the Files Changed table and add a fallback, consistent with the approach for table renderers.

### 4. `create-profile.yaml` and `update-profile.yaml` are implicitly affected

> **Resolved.** Added both files to Files Changed table (marked "No changes -- affected via `_ref: profile-set-fields.yaml`").

Both API files use `_ref: profile-set-fields.yaml` (`create-profile.yaml:26`, `update-profile.yaml:25`). The design modifies `profile-set-fields.yaml` to remove SVG generation but doesn't list these two files in Files Changed.

The change will work transitively through the `_ref`, but these files should be listed for completeness -- reviewers and implementers need to know the full blast radius. Additionally, `profile-set-fields.yaml` currently reads `avatar_color` from payload and computes the hash fallback. After the change, it needs to also pass through `profile.picture` from the payload. Verify that the simplified `profile-set-fields.yaml` correctly handles all fields these two callers need.

**Fix:** Add both files to the Files Changed table (even if marked "no changes needed -- affected via \_ref") and verify the passthrough behavior.

## Behavioral Concerns

### 5. Newly invited users and created contacts lose their avatars

> **Resolved.** All create flows (invite-user, create-contact, first profile save) now generate the SVG client-side. `avatar_color` is persisted on the profile at creation and preserved on edit. No existing users to migrate (new app). Updated Decision 5.

Currently, `invite-user.yaml:67-99` and `create-contact.yaml:73-102` generate an SVG server-side at creation time. After this change, these entities will have `profile.picture: null` until someone edits their profile.

The design acknowledges this in Decision 5 but understates the impact:

- Table renderers (`table_contacts.yaml:28`, `table_users.yaml:28`) will show broken `<img>` tags for all contacts/users without pictures until the table fallback fix is deployed.
- If the fallback fix deploys simultaneously, the experience degrades from "everyone has an avatar with initials" to "most people show a generic placeholder" -- this may look worse to users.

**Consider:** Whether invite-user and create-contact forms should also generate the SVG client-side (same SetState pattern) so new entities get avatars from creation, not just from profile edit. This ties into finding #2.

### 6. `profile-set-fields.yaml` is not a plain API file

> **Resolved.** Updated the Current State table to note `profile-set-fields.yaml` as a shared fragment `_ref`'d by `create-profile.yaml` and `update-profile.yaml`, with a Type column.

The design's "Server-side SVG generation (5 files)" table (design line 25) lists `profile-set-fields.yaml` alongside 4 API files. But `profile-set-fields.yaml` is a reusable YAML fragment `_ref`'d by `create-profile.yaml` and `update-profile.yaml` -- it has no `type: Api` declaration. This doesn't affect the proposed changes but the categorization is misleading.

**Fix:** Note it as a shared fragment in the table, not an API endpoint.

## Minor

### 7. The `.js.njk` pattern has no precedent in this codebase

> **Resolved.** Added a build-time/runtime explanatory comment to the `.js.njk` code example in design.md.

The codebase uses `.yaml.njk` files with `_ref` + vars (e.g. `apps/shared/archive/notifications/`), and uses `_js` in several components. But a `.js.njk` file that produces JavaScript code for `_js` is a new pattern. It will work mechanically, but may surprise developers who haven't seen it before.

Not a blocker, but consider adding a brief comment at the top of `generate-avatar-svg.js.njk` explaining the pattern: "This file is rendered by \_ref at build time, producing JS for \_js at runtime."
