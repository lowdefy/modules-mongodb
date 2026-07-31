---
"@lowdefy/modules-mongodb-reporting": minor
---

reporting: model ownership as `owner: { user_id, name }` instead of a flat `user_id`

The flat `user_id` merged in the previous change was redundant with
`created.user.id` (identical on every document, since nothing transfers
ownership), under-named, and could not render an owner's name — so the UX
design had quietly started reaching into the audit stamp for "Published by".

Ownership is now a named reference, following the shape `deals.salesperson`
already uses (`{ contact_id, name, email }`): `owner.user_id` is the
authorization key every scope filter and mutation matches, and `owner.name`
rides along so a list row or report header can name the owner without a lookup.

It is deliberately **not** the `created` change stamp, even though the two hold
the same person on insert. `created` is written once with `$setOnInsert` — a
historical fact. Authorizing off it would mean ownership could never move
without rewriting the audit record, and would make `created.user` load-bearing
for authorization while `updated.user` right beside it is not, a distinction
nothing in the document signals. `owner` is current state; the stamps are
history.

Two new fragments under `modules/reporting/defaults/`:

- `user_id.yaml` — the `sub ?? id` derivation, now `_ref`'d by all eleven read
  and write sites (and by `change_stamp.yaml`). This derivation has to be
  identical everywhere: a writer that disagreed with a reader would not error,
  the read would simply return nothing, so a user's reports would silently
  vanish rather than visibly break. The `_ref` makes that mechanical rather than
  something each caller remembers.
- `owner.yaml` — `{ user_id, name }`.

Verified against a real MongoDB that an upsert whose filter implies
`owner.user_id` while the update sets the whole `owner` object is accepted
rather than rejected as a path conflict — both conversation writers are upserts,
so this was the one behaviour worth probing rather than reasoning about.
