# Review 2

### 1. The resend path is unhandled — three files, one of them a silent wipe

> **Resolved (auto).** All three confirmed in the code and added. `resend-invitation.yaml:17-22` does
> still `_array.join` to CSV; `check-invite-email.yaml`'s `find_invitation` projection really has no
> `appRoles`, so the design's "already an array" claim was false and deleting the page split alone
> would have posted `roles: []` on every resend; and the split is on `pages/invite.yaml:196`, not
> `api/invite.yaml`. The design now names resend as the module's third role-write path in "The write
> side passes arrays", carries a "The resend caller has no `appRoles` to send" subsection making the
> projection the load-bearing change, lists all three files (plus the dead `find_member` `role: 1`) in
> Files changed, and adds a resend-and-read-back check from both callers to Verification. The
> "Where the CSV lives" table row is corrected to `pages/invite.yaml:196` and gained a paragraph
> naming the four write-side CSV sites, which is why this one hid.

"The write side passes arrays" and the Files-changed table cover `update-access.yaml` and
`invite.yaml`. The **resend** path is the module's third role-write path and none of its three files
are addressed.

**a. `api/resend-invitation.yaml:17-22` still joins to CSV.** It calls `InviteMember` with
`role: { _array.join: [ _payload: roles, ',' ] }` — the same shape the design deletes from
`update-access.yaml` and `invite.yaml`, in a file the table never names. Both resend callers reach
it: the invitations table (`all_invitations_table.yaml:128-137`) and the invite page's pending panel
(`pages/invite.yaml:191-199`). Under the design's assumed contract (`roles: string[]` on both steps),
this file either fails the build or silently keeps writing a CSV.

**b. `api/check-invite-email.yaml:101` projects `role: 1`, not `appRoles: 1`.** The design says the
page's client-side split goes because "`resolved_invitation.appRoles` is already an array." It is not
— it does not exist. `find_invitation` is a `MongoDBFindOne` with an **explicit projection**
(`:98-107`), so `appRoles` is absent from the response, `state.resolved_invitation` never carries it,
and the pending panel's resend posts `roles: []`. That is exactly the silent-empty class the design
warns about in "Where the CSV lives" — a resend that blanks the invitation's roles, reporting
success. `find_member`'s `role: 1` at `:68` is separately dead (nothing reads `resolved_member.role`)
and can go with it.

**c. The client-side split is in `pages/invite.yaml:196`, not `api/invite.yaml`.** The Files-changed
row reads "`modules/user-admin/api/invite.yaml` | … drop the client-side split (L197)". `api/invite.yaml`
has no split; the `_js` split of `state('resolved_invitation.role')` is on the page, which the table
does not list at all. (The upstream role-storage table has the same bare `invite.yaml:197`, so this
looks inherited rather than newly introduced — but it needs disambiguating here, because this design
is what an implementer will work from.)

**Fix.** Add all three files to Files changed: `check-invite-email.yaml` (project `appRoles`, drop
`role` from both projections), `pages/invite.yaml` (delete the `_js` split, read
`resolved_invitation.appRoles`), `resend-invitation.yaml` (`roles` array property, header comment).
Add "resend an invitation and read back its `appRoles` unchanged" to the Verification list — it is a
silent-empty site of exactly the kind the section already flags.

### 2. The pre-`$lookup` roles `$match` cannot be emitted from `members_filter.yaml`

> **Resolved (auto).** Confirmed: `members_base.yaml` holds the org `$match` (`:30-32`) and both
> `$lookup`s (`:33-46`) in one file, and `get_all_members.yaml:21-26` concats base then filter, so no
> stage emitted from `members_filter.yaml` can land ahead of the joins. Took the suggested seam — the
> clause is prepended at **stage 0 of `get_all_members.yaml`**, matching the precedent at
> `get_user_detail.yaml:22-25`, ahead of the org-scope match and with no new file and no split of a
> base shared by three reads. The section is retitled "The roles clause moves to stage 0 of
> `get_all_members.yaml`" and both specified properties are written down: the stage is unconditional
> so it needs `members_filter.yaml:14-18`'s `_object.assign` match-all treatment, and its
> `organizationId` key is load-bearing as the compound index prefix rather than redundant with the
> base's own match. `get_all_members.yaml` added to Files changed; Verification gained a filter-set /
> filter-unset check and an `explain`.

The indexable-filter change (proposed change 3, "`members_filter.yaml` splits in two") says the roles
clause "leaves the post-`$lookup` `$match` and becomes its own stage emitted ahead of the joins."
There is no seam where that stage can go.

`get_all_members.yaml:21-26` concatenates `members_base.yaml` and _then_ `members_filter.yaml`, and
`members_base.yaml` holds the `$match: { organizationId }` at `:30-32` and the two `$lookup`s at
`:33-46` **in one file**. Anything emitted from `members_filter.yaml` lands after both joins by
construction. So the change requires editing a file the table does not list: either
`get_all_members.yaml` emits the roles stage between the two `_ref`s, or `members_base.yaml` is split,
or the clause moves into `members_base.yaml` (which is shared with `get_user_detail` and
`get_users_excel_data`, neither of which has a `filter` payload).

The cheapest option is the one the detail read already demonstrates: `get_user_detail.yaml:22-25`
prepends its own `$match` **before** the `_ref: members_base.yaml`. Doing the same in
`get_all_members.yaml` puts the roles `$match` at stage 0, ahead of the org-scope match, which is
strictly better than the design's placement and needs no new file.

Two things to specify while you are there: the stage is **unconditional** (the pipeline is fixed at
build time; only the `$match` body varies at runtime), so it needs the same
`_object.assign` / match-all treatment `members_filter.yaml:14-18` uses so an unset roles filter
leaves `$match: { organizationId }` rather than an invalid stage — and with the clause at stage 0 the
`organizationId` key in it is what makes the compound index usable, so it is load-bearing rather than
redundant.

### 3. Giving the roles filter the pickers' rich label breaks its selected chips

> **Resolved (auto).** Confirmed against the block source: `hasTagStyling` is
> `opt.color || opt.tag` (`MultipleSelector.js:74-76`), the custom `tagRender` installs only on
> `properties.renderTags || hasTagStyling` (`:110-111`), and an `Option`'s children are
> `renderHtml({ html: opt.label })` (`:227-233`) — so with neither flag antd's default tag would render
> the whole two-line `<div>` inside a 260px control. D4's roles-filter bullet now specifies
> `tag: { title: label }` alongside the rich label and states why it is structural rather than
> decorative; the Files-changed row calls it out.

The decision to send descriptions to the roles filter (D4, "the same rich two-line label the pickers
use") works in the two pickers only because their options carry `tag:`. `filter.roles`
(`all_members_filters.yaml:58-67`) maps to a bare `{ value, label }` and sets neither `tag` nor
`renderTags`.

In `MultipleSelector.js`, `hasTagStyling` is `uniqueValueOptions.some((opt) => opt.color || opt.tag)`
(`:66`) and the custom `tagRender` is installed only when `properties.renderTags || hasTagStyling`
(`:115`). With neither, antd falls back to its default tag, whose content is the `Option`'s
children — and those children are `renderHtml({ html: opt.label })` (`:227-233`). So each selected
filter chip would render the full two-line `<div style="line-height:1.3">…</div>`, label plus
description subtitle, inside a control the same file caps at `maxWidth: 260px` (`:38-40`).

The pickers dodge this via `tag: { title: <label> }`, which both keeps the chip to one line and flips
`hasTagStyling` on. **Fix:** give the filter's options the same `tag: { title: label }` the pickers
have. (D4's own reasoning for keeping the selected chip label-only — "a compact pill in a form
field" — applies verbatim to the filter; it just was not carried across.)

### 4. The upstream ask scopes catalog validation to `UpdateMemberRoles`, but the module has two

role-write steps

> **Resolved (auto).** Confirmed at `crud-invites.mjs:102-122` — validation reads only
> `ctx.body.role`, so with `role` pinned to `''` the `appRoles` additionalField is unvalidated and the
> invitation-side orphan round-trips by accident of where the check lives. "What this needs from
> upstream" gained a "The same question, on `InviteMember`" paragraph asking for the scoping decision on
> **both** steps in the same breath as the property contract, and states that "no catalog check on
> `InviteMember`" is an acceptable answer provided it is the recorded one.

"What this needs from upstream" secures the property that D2 rests on — a submitted id the member
already holds must not be rejected — by proposing the check be scoped to **newly-added** ids, and
grounds that in `UpdateMemberRoles` already fetching the member row. `InviteMember` has no member row
and no "current set", and the resend path submits **stored** ids by definition
(`resend-invitation.yaml`, feeding `InviteMember(resend: true)`). A pending invitation whose role was
later deleted from the catalog is the invitation-side orphan, and resending it re-submits it.

Today the endpoint would accept it: `crud-invites.mjs:102-122` validates only `ctx.body.role`, which
role-storage Decision 3 pins to `''`, and `appRoles` rides as an unvalidated additionalField. So the
happy path holds by accident of where validation lives, not by decision. Since the design is already
asking upstream to pin the step property contract, ask for the validation scoping on **both** steps in
the same breath — "no catalog check on `InviteMember`" is a perfectly good answer, it just needs to be
the recorded one, or a future upstream "validate roles in the invite step too" silently reintroduces
`ROLE_NOT_FOUND` on the Invitations tab.

### 5. The documented index should follow the repo's existing `reference/indexes.md` convention

> **Resolved (auto).** Convention confirmed verbatim at `docs/user-account/reference/indexes.md:10` and
> `docs/workflows/reference/indexes.md:10` ("index creation is a host-app concern"), with
> `docs/deals/index.md:57-59` inline. D7 is rewritten on that ground — the "no migration mechanism"
> point survives only as a parenthetical, and the decision now reads as following a live convention
> rather than working around missing machinery. Output moves to a new
> `docs/user-admin/reference/indexes.md` linked from `docs/user-admin/index.md`; `docs/llms.txt` and the
> `pnpm docs:gen` regen are in Files changed, as is the amendment to role-storage Decision 6 where the
> overridden claim lives.

D7 ("the index is documented, not migrated") reaches the right conclusion on a weaker argument than
the one available, and then puts the output in the wrong place.

The argument used is "this repo has no migration mechanism." True as far as it goes (`scripts/` has
no runner; `docs/user-admin/how-to/migration.md` is a config-migration guide, not a data one). But the
repo already has a settled, stronger position: **index creation is explicitly a host-app concern**,
stated in those words in `docs/user-account/reference/indexes.md:10` and
`docs/workflows/reference/indexes.md:10`, with `docs/deals/index.md:57-59` saying the same inline
("The module documents the contract; the app owns creating them"). That is a live convention this
design is following, not an absence of machinery it is working around — and it makes D7's answer a
convention rather than a concession.

Two consequences for Files changed:

- The index belongs in a new **`docs/user-admin/reference/indexes.md`**, linked from
  `docs/user-admin/index.md` (both sibling modules do exactly this) — not as a paragraph in
  `index.md`, which would make `user-admin` the one module documenting an index inline. A new docs
  page also needs `pnpm docs:gen` (it feeds `docs/llms.txt`, and `docs:check` fails CI on drift);
  neither the regen nor `docs/llms.txt` is in the table.
- role-storage Decision 6 (upstream, `design.md:196`) says the module "provisions it in its own
  migration." This design overrides that. It amends `designs/user-admin-better-auth/design.md` in the
  table but not the upstream design — the contradiction should be recorded where the claim lives.

### 6. `snake-case-data-fields` renames `appRoles`, and a stale documented index fails silently

> **Resolved (auto).** The sibling design exists and role-storage `design.md:179` says exactly what the
> review quotes. D7 gained a closing paragraph naming it, stating that the documented names are the
> physical adapter-derived columns, and spelling out the failure mode: an index against `organization_id`
> / `app_roles` is not an error, it is simply never used, which is the silent full scan D7 exists to
> prevent. The config sites are left as inherited camelCase churn, as the review allows.

The design writes `appRoles` into ~8 config sites, a consumer-facing row-contract key, and — via
D7 — a documented index host apps are told to create. The active sibling upstream design
`lowdefy-design/designs/auth-upgrade/features/snake-case-data-fields/` renames every auth physical
column to snake_case; role-storage spells out the consequence at `design.md:179`
("`appRoles → app_roles` falls out of Decision 1's auto-derive with no special case, alongside
`organizationId`") and explicitly declines to depend on the ordering. This design never mentions it.

For the config sites that is fine — the module already reads camelCase `organizationId` and `userId`,
so it is inheriting an existing churn, not creating one. The **documented index** is different: an
index on `{ organizationId: 1, appRoles: 1 }` against a collection whose columns became
`organization_id` / `app_roles` is not an error, it is simply never used, and the failure mode is the
full scan D7 exists to prevent, in production, with nothing to notice it. Given D7's whole argument is
that documenting is sufficient _because_ the filter is correct without the index, that silent
degradation is the one cost worth a sentence.

One line in D7 naming the sibling and saying what happens when it lands (the indexes page is
regenerated with the physical names; ideally it states the names are physical and adapter-derived) is
enough.

### 7. Nothing lets an admin find the members holding an orphan

> **Resolved.** Decided with the design owner, and it reframes more than this finding. Retiring a role
> from `auth.roles` is not something that happens in normal operation, and when it does the data is
> repaired by **a migration run by the app** — not by an admin working through the UI member by member.
> So the orphan state is an anomaly indicator with a deliberately short shelf life, and the module's job
> is to show that something is not as expected, not to make cleanup ergonomic.
>
> The enumeration gap is therefore **accepted and made explicit** rather than filled: the Non-goal now
> states that finding orphan-holders is a visual scan of the Members list's flagged `⚑` chips, accepted
> at the module's stated sizing, and records the rejected alternative (concat a
> distinct-`appRoles`-minus-catalog read onto the filter's options) with the reason — the migration does
> not consult the filter, so it would be new read surface for a state nobody queries by role.
>
> Two knock-ons in the design: D2 gained an "orphan state is an anomaly indicator, not a workflow"
> paragraph that is now what sizes every orphan affordance here, and D1's rejection of `disabled: true`
> no longer leans on removal being "the one action the admin must be able to take" — removal is a
> convenience for a one-off. The rc-select `closable = !disabled && !itemDisabled` mechanics still rule
> the variant out, joined by the simpler ground that an enabled option is the same entry shape as a
> catalog option with no flag to explain.
>
> The picker fix itself (D1's option injection) is untouched and still load-bearing: the blank chip and
> the `undefined`-into-`appRoles` silent delete fire whenever an orphan exists at all, however briefly,
> and corrupt data on the way through.

D2 and the Non-goals together make per-member removal the sanctioned cleanup path ("an orphan is
displayed, saveable, and removable one member at a time") and rule out bulk cleanup. That is a
coherent position, but the module offers no way to enumerate the affected members. The roles filter's
options come from `_build.authConfig.roles` (`all_members_filters.yaml:58-67`) — catalog ids only, so
the one role you would want to filter on is the one you cannot select. The Members list's Roles column
does flag orphans (`all_members_table.yaml:38-49`), so the answer today is "page through the whole
list by eye."

Worth resolving one way or the other rather than leaving implied: either say in Non-goals that finding
orphan-holders is a visual scan of the list and that is accepted at the module's stated sizing (low
thousands of members, `user-admin-better-auth` design line 65), or note the cheap alternative — the
filter's options could concat a distinct-`appRoles`-minus-catalog read the same way the picker concats
`orphan_ids`. The first is probably right; it just should be a decision, since D2 is what makes
orphans persistent rather than transient.

### 8. `all_members_table.yaml`'s stale split comments are not in Files changed

> **Resolved (auto).** All three comments confirmed at the quoted lines, two of them journey comments
> naming a task number. The file gets its own subsection in Proposed config and a Files-changed row.
> The dead `{% elif r.primary %}` branch is **dropped**: `primary` appears nowhere else in the module or
> `docs/` as a role concept, so it renders a purple pill for a state that cannot occur, and this design
> is the one respecifying the resolved-entry shape.

The design enumerates comment fixes file by file, which is the right approach for a change whose main
hazard is stale narration — but `all_members_table.yaml` is missing, and it carries three:

- `:5` "The real read (split roles, derive status, org scope, paginate) is task 9."
- `:41-44` "Roles come split (Decision 1) … task 9 authors the `$split` + catalog reconcile that
  produces them."
- `:82` "roles split + resolved against the catalog (`{ label, orphan }`)" — also the wrong entry
  shape once `roles_from_catalog.yaml` gains `id` and `description`.

Two of the three are also journey comments referencing a task number, which the repo's comment rule
rules out independently of this change.

Separately, `:49`'s renderer has an `{% elif r.primary %}` branch and `roles_from_catalog.yaml`
produces no `primary` field, so it is dead today. Since this design is the one respecifying the
resolved-entry shape (and `docs/user-admin/reference/row-contract.md:29` documents it), it is the
natural place to either drop that branch or say why it stays.
