# Profile identity on the three person pages

`user-account/view`, `user-admin/view` and `contacts/view` all show one person, and all three
render that person's identity differently. The name appears anywhere from one to three times per
page, the avatar appears on none of them, and the read-only Profile tile decomposes the name into
honorific / first / last rows — a form shape leaking into a view.

This design gives the three pages one identity treatment: **the avatar sits in the page header
beside the title, and the name renders exactly once — as the title.**

Mockup: `mockups/options.html` (option A; toggle A–E to see the rejected alternatives).

## Proposed change

1. Add an `avatar_src` slot to `modules/shared/layout/title-block.yaml` — a 48px `Avatar` between
   the back button and the status pill, built only when the var is wired.
2. Forward `avatar_src` through `modules/layout/components/page.yaml` to `title-block`.
3. Retitle the three pages so `title` carries **only** the person's name and the entity word moves
   to the existing `type` eyebrow (see [Titles](#titles)).
4. Drop `user-account/view`'s hand-written `description` subtitle. Make `title-block`'s subtitle
   line and its skeleton bar conditional, so a page with no subtitle renders neither.
5. Drop the name from the Profile tile's `SmartDescriptions` on all three pages — it is in the
   title now. `form_core.yaml` stays a single file: the name fields are now only ever a form row,
   so the flat-field-list variant the views used to need has no consumer left.
6. Add a `name` field to `get_account`, with the same fallback chain `members_base` already uses,
   so the account page's title survives a not-yet-onboarded user.
7. Document `avatar_src` in `docs/layout/index.md`'s page-props table.

## Titles

`docs/layout/index.md:64-75` already fixes the contract, and it is the justification for the whole
change rather than a new convention invented here:

| Prop    | Documented meaning                                                                          |
| ------- | ------------------------------------------------------------------------------------------- |
| `title` | "Entity name/identifier — the `<h2>` heading. **Never concatenate type + name here.**"      |
| `type`  | "Entity-type 'eyebrow' rendered uppercase above the title. Convention: view → entity type." |

`user-account/view` currently breaks it: `title: Account` puts a _type_ in the entity-name slot.
Moving "Account" to the eyebrow both fixes that and frees `title` for the name.

| Page                | `type` (eyebrow)                       | `title` (h1)                     | Subtitle                        |
| ------------------- | -------------------------------------- | -------------------------------- | ------------------------------- |
| `user-account/view` | `Account`                              | the caller's own name            | none                            |
| `user-admin/view`   | `User`                                 | the person's name                | none                            |
| `contacts/view`     | `Contact` (`label` var, already wired) | honorific + name (already wired) | change stamp (`doc`, unchanged) |

Notes on the two judgement calls:

- **The honorific stays on `contacts/view`.** "Dr. Jane Mokoena" is the contact's name as you would
  address them, not a type prefix, so it does not violate the "never concatenate type + name" rule.
  `user-admin/view` has no honorific because its `name` comes from the shared `members_base` shape
  (`$contact.profile.name` → `$user.name`); that page is about app access, not correspondence.
- **`user-admin/view` gets a literal `User` eyebrow**, not a new module var. There is no concrete
  request for a configurable label on that module, and `contacts`' `label` var exists because that
  module is explicitly re-labelled per deployment ("Contact" / "Client" / "Candidate").

## Current state

### The name renders an inconsistent number of times

| Page                | `h1`                | Identity card                  | Description rows         | Total |
| ------------------- | ------------------- | ------------------------------ | ------------------------ | ----- |
| `user-account/view` | "Account" (no name) | none                           | honorific + first + last | 1×    |
| `user-admin/view`   | the name            | none                           | honorific + first + last | 2×    |
| `contacts/view`     | honorific + name    | `identity-header` (name+email) | honorific + first + last | 3×    |

The description rows are the `fields_core.yaml` `_ref` shared with the edit modals. In a read view
they render as three separate rows — two of which are usually the least useful cells on the page.

### The avatar is absent from all three

The avatar was specified in both better-auth mockups
(`designs/user-admin-better-auth/mockups/screens/view.html:204`,
`designs/user-account-better-auth/mockups/screens/account.html:180`) as a proposed new
`title-block` slot. It was never built; `modules/user-account/pages/view.yaml:36-40` and
`modules/user-admin/pages/view.yaml:12-15` both carry a comment deferring it as "out of scope".
This design closes that gap.

Every person already has an avatar to show: `write-profile` generates a gradient-plus-initials SVG
into `profile.picture` at write time, and all three reads project the whole `profile` subdoc, so
`profile.picture` is available on each page without a read change.

### `identity-header.yaml` becomes unused

`modules/shared/layout/identity-header.yaml` — the primary-tinted avatar + name + email card from
`designs/_completed/profile-view-layouts/` — is used by `contacts/components/view_contact.yaml:6`
and `contacts/pages/edit.yaml:84`. The view usage is what makes `contacts/view` render the name
three times, so it goes. **The `contacts/pages/edit.yaml` usage stays** — an edit page has no
`title-block` identity and still needs the header — so the file is not deleted.

## Design decisions

**1. Identity belongs in the page header, not in the content.** The alternatives all move identity
into the content area (tinted banner, Profile-card header, side tile, centred hero — options B–E in
the mockup). Every one of them forces the two person pages to retitle their `h1` away from the
person's name, because otherwise the name renders twice. That costs the browser tab title and the
breadcrumb tail: with two user tabs open you cannot tell them apart. Option A is the only shape
where nothing has to be given up — both person pages already title with the name, and the account
page simply adopts the same shape.

**2. The entity word moves to the eyebrow rather than being dropped.** "Account" carries real
information — it says which page you are on. The eyebrow is `title-block`'s existing slot for
exactly that, already used by `contacts/view`, so this needs no new surface.

**3. `avatar_src` is a string, matching `identity-header.yaml`.** Same var name, same shape (an
image src, with the `Avatar` block's `icon: AiOutlineUser` as the null fallback). Two components
taking the same input under two different names would be gratuitous.

The `Avatar` block's `icon` takes a **react-icons** name, not an Ant Design one — the schema is
explicit ("Name of an React-Icon"). `UserOutlined` does not resolve and renders an error glyph.
Three components in the repo had this wrong, all fixed here: `identity-header.yaml`,
`user-account`'s exported `user-avatar.yaml`, and `apps/demo/pages/404.yaml` (`HomeOutlined`).

**4. Only the hand-written subtitle goes away; change stamps stay.** `user-account/view` and
`user-admin/view` pass neither `description` nor `doc`, so after this change they render no subtitle
at all. `contacts/view` passes `doc` and keeps its change-stamp line — that is real provenance, not
filler, so it is out of scope. Making the subtitle line conditional is what stops the two
subtitle-less pages from skeletoning a second bar for a line that never arrives; `contacts/view`
still gets both bars, correctly.

## Changes

| File                                                     | Change                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modules/shared/layout/title-block.yaml`                 | Add the `avatar_src` slot (48px `Avatar`, `flex: 0 0 auto`, `selfAlign: middle`, `marginRight: 12`, skeletons with `loading`), between back button and status pill. Make the subtitle `<div>` and its skeleton bar conditional on `description`/`doc`. |
| `modules/layout/components/page.yaml`                    | Forward `avatar_src` (default `null`) to `title-block`.                                                                                                                                                                                                |
| `modules/user-account/pages/view.yaml`                   | `type: Account`; `title` → `get_account.0.name`; drop `description`; add `avatar_src` + `loading`. Remove the deferral comment.                                                                                                                        |
| `modules/user-admin/pages/view.yaml`                     | `type: User`; add `avatar_src`. Remove the deferral comment.                                                                                                                                                                                           |
| `modules/contacts/pages/view.yaml`                       | Add `avatar_src`.                                                                                                                                                                                                                                      |
| `modules/user-account/requests/get_account.yaml`         | Project `name: { $ifNull: ["$contact.profile.name", "$name"] }`.                                                                                                                                                                                       |
| `modules/user-account/components/view/tile_profile.yaml` | Drop the name-fields `_ref` from `fields` — email becomes the first row.                                                                                                                                                                               |
| `modules/user-admin/components/view/tile_profile.yaml`   | Same.                                                                                                                                                                                                                                                  |
| `modules/contacts/components/view_contact.yaml`          | Same, plus drop the `identity-header` `_ref` and add an `email` row (it was only in the header). Rebind `data` to the whole contact row so `email` resolves next to the `profile.*` paths, matching the sibling views.                                 |
| `docs/layout/index.md`                                   | Add `avatar_src` to the page-props table.                                                                                                                                                                                                              |
| `apps/demo/`                                             | No change — all three pages are already demo consumers, so the slot ships with three worked examples.                                                                                                                                                  |

## Out of scope

- **The avatar picker.** `modules/shared/profile/avatar-picker.yaml` (in flight) stays where it is,
  in the edit modal and onboarding. The title-block avatar is display-only; making it the picker
  affordance was option E and was not chosen.
- **`identity-header.yaml` on `contacts/pages/edit.yaml`.** Unchanged, per Current state.
- **A status pill on `user-account/view` or `contacts/view`.** Neither page has a status today and
  no request asks for one.
