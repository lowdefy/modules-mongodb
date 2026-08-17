---
"@lowdefy/modules-mongodb-contacts": minor
---

contacts: make the contact selectors filterable, and add an option to hide user records

**`request_stages.selector` now splices before the label projection.**
`get_contacts_for_selector` concatenated consumer stages onto the **end** of its
pipeline, after `$project` and `$sort`. By that point the only fields left are
`label` and `value`, so the extension point could not do the thing selector
stages exist for — filter the option list on document fields. Stages now run
between the base `$match` and the `$project`, matching
`get_companies_for_selector`, which has always spliced on that side.

**`request_stages.selector` now also applies to `get_role_contacts_for_selector`.**
That request had no extension point at all, so `role-contact-selector` could not
be filtered from config.

**New `exclude_users_from_selectors` var (boolean, default `false`).** Excludes
this app's user records (`apps.<app_name>.is_user`) from
`basic-contact-selector` and `role-contact-selector`. The motivating case is an
app whose contacts collection also holds its user records and wants those out of
the pickers while keeping them on the contacts list.

**Labels are null-guarded.** `$concat` returns null if any operand is null or
missing, so a contact with no `profile.name` or no `email` rendered a blank,
unselectable row. Both operands now fall back — to `lowercase_email` and then to
`no email` — matching `get_role_contacts_for_selector`.

**Docs correction.** `docs/contacts/index.md` claimed user records "are excluded
from the contact list". No request filtered on `is_user`; only the editability
guards existed. The page now describes what the module actually does.

## Not covered: the rich `contact-selector`

Neither `request_stages.selector` nor `exclude_users_from_selectors` reaches
`search_contacts`, which backs the rich `contact-selector`. Filter that one per
call site with its existing `filter` var.

This is not a scoping choice — it is a bug we could not work around.
`search_contacts` is `_ref`'d with per-call vars from
`contact-selector.yaml.njk`, and adding a nested `_ref` to it, or restructuring
its pipeline into `_build.array.concat`, silently breaks `_module.var`
resolution **elsewhere in the module**: `app_name` resolved to `null` in
`pages/edit.yaml`, `pages/view.yaml` and `get_role_contacts_for_selector`,
compiling to field paths like `$apps.null.is_user`. The build reports success
with no warning. Adding a bare `_module.var` to that request is fine; the
trigger is the nested `_ref` or the concat restructure. Worth fixing upstream
before extending the rich selector.

## Compatibility

**Unchanged where `selector` is unset and `exclude_users_from_selectors` is
off** — the default `[]` contributes nothing to the concat, and the flag's
clause is dropped from the `$match` rather than compiled as an always-true
expression. That is every consumer in this repo today.

`get_role_contacts_for_selector`'s roles check now sits inside an `$and` (as
`$and: [<roles>, true]`) so the optional user-record clause can join it — a
`$match` takes only one `$expr` key. Semantically identical to the bare `$gt`.

If you already pass `selector` stages to `get_contacts_for_selector`, check them
for two things:

- **Stages referencing `label` or `value`.** Those fields do not exist at the
  new splice point. Stages that filter or derive on document fields keep
  working, and now actually affect the result set.
- **Stages that depend on ordering — `$limit`, `$skip`, `$group`, `$count`.**
  The trailing `$sort: { label: 1 }` has not moved, so a `$limit` that used to
  mean "the first N alphabetically" now means "an arbitrary N, then sorted".
  This changes results silently, without an error, and referencing neither
  `label` nor `value` is no protection against it.

Note that `selector` stages now run in `get_role_contacts_for_selector` too. If
you set `selector` for the basic picker, confirm the stages also make sense
against the role-scoped one.

## Verification

Built the demo app with `exclude_users_from_selectors: true` and a marker
`selector` stage configured. Both selectors compile to
`$match` (base + `$apps.demo.is_user`) → `$match` (marker) → `$project` →
`$sort`. With both unset, the role selector compiles back to
`$match` → `$project` → `$sort` with `$and: [<roles>, true]`, and no `apps.null`
field paths appear anywhere in the build.
