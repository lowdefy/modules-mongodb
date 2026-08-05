# Review 3

Re-review of the reframed design (the storage split has shipped via the upstream
org-authority migration; this is now the module's cleanup side). Reviews 1 and 2 are
fully resolved and settled — this pass looks only at what the reframe introduced.
Almost every factual claim in the design checks out against the code, the built
artifact, and the upstream org-authority design (Decisions 9/11/12 confirmed;
`authconfig-module-projection` is `_completed`, so the stale gap notes are genuinely
stale; `snake-case-data-fields` is still under `features/`, matching D7). Three findings.

### 1. The invitations row has the same `roles_arr` / `role_ids` redundancy D-alias calls "the one place"

> **Resolved.** Confirmed: `invitations_base.yaml` emits both `roles_arr` and `role_ids` (both
> `$ifNull: [$appRoles, []]`), and `close_row` is the shared terminal stage, so the "one place" claim
> was wrong. The finding surfaced a bad requirement underneath it, not just a scope gap: the module
> owner confirms **no consumer binds the raw id arrays** — consumers bind their own custom attributes,
> and roles already display through the resolved `roles` column on the table and export. So D-alias was
> reframed to drop **both** `roles_arr` and `role_ids` module-wide (members and invitations),
> superseding org-authority Decision 11's kept-aliases choice. `roles` — now carrying `id` per entry
> (D4) — is the single roles surface; the modal seed maps `roles` → ids, and the list Resend button
> stops sending roles (D-resend preserves them server-side). `close_row` rule 2 then reduces to one
> path (`appRoles → roles`) on every read. The reversal is recorded in this design and in
> `row-contract.md`; the `_completed/org-authority` design stays as history.

The decision to drop the duplicate id-alias (D-alias) says the members detail row is
"the one place the migration overshot the kept-aliases decision into genuine redundancy"
(design lines 271–273). It is not the only place. `invitations_base.yaml:31-39` emits
**both** `roles_arr` and `role_ids`, each `$ifNull: ["$appRoles", []]` — the identical
two-names-for-one-value the finding is built on. Its own header comment names the split
(`invitations_base.yaml:10-14`: "`roles_arr` / `role_ids` — the two published wire names
for the invitation's app roles … the list's Resend button reads `role_ids`"), and the
Resend button does read it (`all_invitations_table.yaml:135-136`, `roles: { _event: row.role_ids }`).

This matters because `close_row.yaml` is the **shared** terminal stage for the members
_and_ invitations reads, and its rule 2 (`close_row.yaml:10-16`) — the very rule D-alias
cites — says "the row never offers two paths to one value" and lists only
`appRoles → roles_arr (ids) / roles (resolved)`, not `role_ids`. After D-alias fixes the
members detail row, the invitations row still breaks that rule, and the alias-map comment
the design is updating (Files-changed, design line 498) would still not govern the
`role_ids` alias that survives on the invitations branch.

The members-side fix is exactly symmetric to what invitations needs: repoint the one
internal consumer and drop the duplicate. There, the consumer is the modal seed
(`modal_access.yaml:29`, repointed to `roles_arr`); on invitations it is the list Resend
button (`all_invitations_table.yaml:136`, repoint to `row.roles_arr`), after which
`role_ids` can leave `invitations_base.yaml` entirely — `roles_arr` stays as the export
column the row-contract documents (`row-contract.md:110-111`). That removes `role_ids`
from the module altogether and makes `close_row` rule 2 hold on every read.

Note the tension to decide against: upstream org-authority Decision 11 kept **both**
`roles_arr` and `role_ids` as published wire aliases and said "Repoint both" — so keeping
`role_ids` on invitations is arguably that decision's intent, while the shipped
`row-contract.md:116-121` treats `role_ids` as a non-contract, invitations-only internal
key (i.e. droppable). Either way, D-alias's "one place" sentence is wrong as written.
**Fix:** either extend D-alias symmetrically to the invitations branch (repoint the list
Resend, drop `role_ids` from `invitations_base.yaml`), or, if `role_ids` is deliberately
retained on invitations, correct the "one place" claim and have the updated `close_row`
alias-map comment document `role_ids` as a governed alias rather than implying rule 2
holds everywhere.

### 2. Repointing the modal seed to `roles_arr` falsifies a row-contract claim the design does not update

> **Resolved.** Dissolved by the finding-1 reframe. The seed no longer moves _to_ `roles_arr` — both
> raw-id aliases are dropped, and the seed maps the resolved `roles` array to its ids. So the
> row-contract sentence "`roles_arr` — the ids as stored. Nothing inside the module reads it" is not
> corrected but **deleted**: the field it describes is gone. The design's `row-contract.md` change is
> updated accordingly (drop `roles_arr` and `role_ids` entirely, `roles` becomes the one roles binding).

D-alias repoints the access-modal seed from `role_ids` to `roles_arr`
(`modal_access.yaml:29` → `get_user_detail.0.roles_arr`), making the module read
`roles_arr` internally for the first time. But `docs/user-admin/reference/row-contract.md:70`
states the opposite in as many words: "**`roles_arr`** — the ids as stored. **Nothing
inside the module reads it**; it exists for consumer column bindings." That claim is true
today (nothing reads `roles_arr`; the modal reads `role_ids`) and becomes false the moment
the seed moves.

The design's Files-changed row for `row-contract.md` (design line 511) covers only
"`role_ids` off the members detail row (kept on invitations); `roles` gains `id` +
`description`" — it does not touch line 70. Since `docs/` is a source of truth and this
design is otherwise meticulous about doc-sync, the row-contract edit should also correct
the "Nothing inside the module reads it" sentence (the access modal now seeds from it).

### 3. `all_members_table.yaml` no longer carries the "$split / task-number" comments the design says to cut

> **Resolved (auto).** Confirmed against the file: no `$split` or task-number comments remain; the
> genuinely-stale comments are the `{ label, orphan }` entry-shape ones at lines 40 and 81, and the
> dead `{% elif r.primary %}` branch is at line 48. Corrected the design's Proposed-config prose and
> the Files-changed row to describe the real comment work — updating the `{ label, orphan }` entry-shape
> comments to `{ id, label, description, orphan }` — instead of cutting `$split`/task-number comments.
> The target shape and the dead-branch removal were already correct.

The Proposed config (design lines 480–482) and Files-changed (design line 503) say to cut
the Roles column's "split-narrating comments (referencing `$split` and task numbers)."
Those comments were the pre-migration state review-2 finding 8 quoted; they are already
gone. The current file carries no `$split` and no task number — only entry-shape comments
(`all_members_table.yaml:40-43` and `:80-83`) describing the row as `{ label, orphan }`.
Those are the genuinely stale ones (the shape becomes `{ id, label, description, orphan }`
under this design), and they are what the file's comment work actually is, alongside
dropping the dead `{% elif r.primary %}` branch (`all_members_table.yaml:48`, confirmed
dead — `primary` appears nowhere else in the module as a role concept).

Minor, but this is a design whose whole point is retiring stale comments, so its own
description of the stale comments should match the file. **Fix:** reword the Proposed
config / Files-changed note to "update the `{ label, orphan }` entry-shape comments to the
resolved shape" rather than "$split / task numbers."
