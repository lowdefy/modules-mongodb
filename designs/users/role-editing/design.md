# Roles UX and org-authority migration corrections

The storage half of this design has already shipped. The upstream
[org-authority](../../../../lowdefy-design/designs/auth-upgrade/_completed/org-authority/design.md)
rollout moved app roles to the native `member.appRoles` array, welded each module instance to its
organization through an `org_slug` var, kept `roles_arr` / `role_ids` as published wire aliases, and
added the `owner`/`admin`/`member` org-authority tier with its own grant surface. That work landed as
a general migration driven by the upstream design — so this design is now the module's own side of it:
the roles-UX fixes the migration left undone, and the correctness gaps it introduced by not thinking
through this repo's specific needs.

The picker still renders a blank, silently-deleting chip for a held orphan; role descriptions never
reach the view chips or the roles filter; `required: true` on both role selectors draws an asterisk
behind a rule that cannot fire; three comments still claim `_build.authConfig` is unavailable when it
demonstrably resolves; resending a pending invitation from the Invitations list silently strips its
org-authority tier; and the compound index the shipped role filter depends on is documented nowhere,
so no host app will create it.

## Proposed change

1. **The picker offers the catalog plus the member's held orphans.** One change fixes both the blank
   chip and the silent deletion — they are the same unmatched-value bug (D1, D2).
2. **`roles_from_catalog` carries `id` and `description` per resolved entry**, which unlocks
   descriptions on the three surfaces still missing them — the view chips, the roles filter, and
   option search — and gives the orphan option a stable value that does not derive from a display
   label (D4).
3. **Delete `required: true`** from both role `MultipleSelector`s. It validates nothing on an
   array-valued input and the asterisk it draws is wrong; the `org_role` single `Selector` keeps it,
   where it fires (D6).
4. **Delete the three stale `NOTE (running-engine gap)` comments** claiming `_build.authConfig` does
   not resolve in module config. It does, and the built artifact proves it (D5-notes).
5. **Fix the resend org-authority downgrade.** `resend-invitation.yaml` preserves the stored
   `orgRole` / `appRoles` / `attributes` server-side, so no caller can blank or downgrade a pending
   invitation by omitting a field (D-resend).
6. **Document the role-filter index** in a new `docs/user-admin/reference/indexes.md`, and confirm the
   shipped pre-join `$match` actually uses it (D7).
7. **Drop both raw-id aliases** `roles_arr` and `role_ids` across the module. `roles` — the resolved
   array, now carrying `id` per entry (D4) — becomes the single published roles surface, and every
   internal id need derives from it. This supersedes org-authority Decision 11's kept-aliases choice on
   new evidence: no consumer binds the raw ids, so the surface Decision 11 was protecting is a phantom
   (D-alias).
8. **Cut dead and stale config** — the unreachable `{% elif r.primary %}` branch in the members
   table, and the journey/task-number and stale-model comments the migration left behind.

## What the org-authority migration shipped

This design replaces a much larger one that described the module's side of the storage split. Almost
all of it is now built, and built against a decision this design's earlier version got the other way,
so the context matters:

- **App roles are read natively from `member.appRoles`.** Every `$split` is gone, the role filter is a
  pre-join `$match`, and the write paths pass arrays on the `appRoles` step property. Verified across
  the read stages and all thirteen write endpoints.
- **`roles_arr` and `role_ids` shipped as published wire aliases**, fed from `appRoles` — and this
  design drops both (D-alias), superseding org-authority Decision 11. Decision 11 kept them on the
  premise that they are a row-contract surface a consumer app binds `table_columns` /
  `download_columns` to, so deleting them would silently blank those columns. That premise does not
  hold for this module: consumers bind their own custom attributes, not roles, and roles already
  display through the resolved `roles` column on both the table and the export — so nothing binds the
  raw id arrays. The reversal is recorded here and in `row-contract.md`; the `_completed/org-authority`
  design stays as history.
- **The organization is welded per instance** through the `org_slug` var (org-authority Decision 12),
  replacing `_organization: id` at every read `$match` and defaulting every step's `organizationId`.
  Out of this design's scope, but it is why the reads and writes all name `org_slug`.
- **The org-authority tier is a first-class module surface** — a `member.role` → `org_role` alias on
  the detail read, an `org_role` `Selector` behind the `org_authority` var with its own submit, and a
  `UpdateMemberOrgRole` write (`api/update-org-role.yaml`). This design does not build that surface;
  it only corrects where the migration wired it into invitations incompletely (D-resend).

Two upstream questions the earlier version raised are now answered and need no further asking. There
is **no catalog validation on submitted app roles** — org-authority Decision 9 makes an unrecognised
id grant nothing and round-trip harmlessly, which is what D2 rests on. And the role-write step
property is **`appRoles`** (array), not the `roles` the earlier version assumed. Both are in the
shipped code.

## Key decisions

### D1. Options are the catalog plus the member's held orphans

The selector must offer `catalog ids ∪ appRoles` — ordinary, enabled options labelled
`<id> (no longer configured)`. The migration did **not** do this: `modal_access.yaml` seeds the picker
from `get_user_detail.0.role_ids` (all held ids, orphans included) but builds `options` from the
catalog alone, and carries a comment asserting an orphan "stays selected and can be removed, but not
re-added" without options. That assertion is false — the mechanism in Current State below shows why —
and it is the live bug.

Two properties fall out of concatenating the held orphans onto the catalog options, rather than
needing enforcement:

**An orphan can be removed.** The tempting variant is `disabled: true`, so it renders but cannot be
re-selected. That does not work: rc-select computes a tag's closable flag as
`closable = !disabled && !itemDisabled` (`SelectInput/Content/MultipleContent.js:109`), so a disabled
option produces a **non-removable** chip. It would label the orphan and simultaneously trap it. An
ordinary enabled option is also less config: the same entry shape as a catalog option, through the
same render path, with no flag to explain.

**It cannot be added back once removed.** The orphan options come from the detail read, so after
removing one and saving, the refetch drops it from the member's `appRoles`, it is no longer an option,
and there is no way to re-enter it. Within a single unsaved session it can be re-selected, which is
harmless — the member already holds it. The admin is never offered a role the app does not configure
and no member holds.

### D2. Submitting a held orphan saves, and there is no validation rule

The picker submits whatever is selected. A save carrying an untouched orphan writes it back unchanged.
So the orphan is never stripped, editing a member's **attributes** is never blocked by a role the app
no longer configures, and the UI is where the admin learns about it: a flagged chip on the tile, a
`(no longer configured)` option in the picker, and a hint on the field.

**The orphan state is an anomaly indicator, not a workflow.** A role leaving `auth.roles` is rare and
deliberate, and the cleanup that follows is a **data migration run by the app**, not per-member
editing in this UI. So the module's job is to surface the anomaly and then stay out of the way — the
admin must be able to save the member without being blocked, and removing the role by hand is a
convenience for a one-off, not the sanctioned cleanup path. Nothing here is built to make bulk cleanup
ergonomic, because bulk cleanup does not happen here (see Non-goals).

This is sound because the write no longer rejects a held orphan — org-authority Decision 9 puts no
catalog validation on submitted `appRoles`, so a non-catalog id grants nothing (gate references are
build-validated against the catalog, so no page or API can name it) and simply round-trips.

Rejected: a `validate` rule failing while an orphan is selected. It buys nothing once the write
accepts the value, and it costs the attributes edit — the admin would have to resolve the role before
touching an unrelated field. Forcing that is a restriction with no harm to prevent.

### D4. Descriptions go to the view chips, the filter, and search — not the selected chip

The catalog already carries the description text, and the access-modal picker already renders a rich
two-line label from it (the migration got that one right). Three surfaces still do not get it, and all
three need `roles_from_catalog.yaml` to carry `description` alongside `label` — which it does not
today (it emits only `{ label, orphan }`):

- **View chips.** `tile_attributes.yaml` renders `r.label` only. Add a `title="{{ r.description }}"`
  tooltip on the ordinary chip, matching the tooltip the orphan chip already has. Nunjucks renders a
  `null` description as an empty attribute — no tooltip, same as omitting it — so no `{% if %}` guard
  is needed.
- **Roles filter.** `all_members_filters.yaml` maps the catalog to a plain `{ value, label }`. Give it
  the same rich two-line label the pickers use **plus the `tag: { title: label }` the pickers also
  carry.** The tag is not decoration: without it, `MultipleSelector` installs its custom `tagRender`
  only when `properties.renderTags || hasTagStyling` (`hasTagStyling = opt.color || opt.tag`), and with
  neither, antd's default tag renders the `Option`'s children — the whole two-line `<div>` with its
  description subtitle — inside a control capped at `maxWidth: 260px`. Adding `tag` flips
  `hasTagStyling` on and routes the chip through `tagRender`'s `title`, exactly as in the two pickers.
- **Option search.** `filterString` becomes `label + " " + description`, so typing a word from a
  description matches. Not by dropping `filterString` to reach `filterOption`'s HTML fallback: that
  string includes the inline styles, so `line-height`, `font-size` and `color` would all become
  matchable terms.

**The selected chip stays label-only.** `tag.title` is a compact pill in a form field, several to a
row; a description would not fit and there is nowhere to put a tooltip that does not fight the close
button. The dropdown is where the admin is choosing and where the explanation belongs. A role with no
`description` renders label-only everywhere, unchanged.

**`id` is carried too, and it is load-bearing well beyond D1.** The orphan option's `value:` is written
back to `appRoles`, so it must be the real id — not the resolved entry's `label`, which falls back to
the raw id for an unmatched value (`$ifNull: ["$$hit.label", "$$rid"]`) only so the display chip reads.
Deriving the orphan option value from that display default means a future change to the fallback — a
prefix, "Unknown role", a translated string — silently writes a fabricated role id. Carrying the real
`id` on every resolved entry removes that coupling — and it is what lets `roles` be the module's single
id source (D-alias): `orphan_ids` is built from it, and the access modal seeds its picker by mapping
`roles` to its `id`s, so the raw-id aliases `roles_arr` / `role_ids` are redundant internally as well
as externally.

### D5-notes. The three stale gap notes are deleted, verified against the built artifact

`roles_from_catalog.yaml`, `all_members_filters.yaml` and `invite_form.yaml` each carry a
`NOTE (running-engine gap)` saying `_build.authConfig` is unavailable to module config, throws "cannot
be used inside the auth block", and was written "design-faithful per the build-red directive" pending
an upstream fix. That is now false on every count. The upstream
[authconfig-module-projection](../../../../lowdefy-design/designs/auth-upgrade/_completed/authconfig-module-projection/design.md)
design is complete, and the built artifact proves the operator resolves: `apps/demo/.lowdefy/server/build/pages/user-admin/view.json`
carries the demo catalog's role labels and descriptions ("User Admin", "Administers users…") baked in.
The notes are stale and misdescribe a live path — they read to the next agent as an unresolved gap and
are exactly why the description work above read as unbuilt.

### D6. `required: true` is removed from the array selectors, not repaired

`modal_access.yaml`'s and `invite_form.yaml`'s role `MultipleSelector`s both set `required: true`.
Lowdefy compiles `required` into exactly one rule, `pass: { _not: { _type: 'none' } }`. A
`MultipleSelector`'s value is always an array — empty when unset — and `[]` is not `none`, so the rule
can never fail. It is inert as validation, but not as rendering: the block forwards `required` to
`Label`, which sets `ant-form-item-required` and draws the red asterisk.

The intent behind it is also wrong: a member with no roles is a supported state (`appRoles` is absent
for a self-signed-up member), and an invite with an empty role array already mints a role-less member
successfully. So the asterisk marks a field the flow does not require. Removing it stops the config
lying; replacing it with a working array-aware rule would newly forbid something the platform
supports. If choosing roles at invite time should be mandatory, that needs a real rule, in its own
change.

**The `org_role` single `Selector` keeps `required: true`.** Its value is a string, not an array, so
`_not none` can fire, and the field genuinely requires a value (`member` is its no-authority default,
not an absence). The inert-`required`-on-arrays wart is left alone everywhere else as an engine-level
issue (Non-goals).

Note the `Validate` action in `modal_access` already matches `^roles$` (commit `88b0d281`), so once
`required` is gone that regex matches a field with no rules — harmless, and the roles namespace stays
covered for any future rule.

### D-resend. Resend preserves the org tier and app roles server-side

The migration added the org-authority tier to invitations and re-sends it on resend, but wired only
one of the two resend callers to carry it. `resend-invitation.yaml` sends
`orgRole: { _payload: org_role }` with no default, and its own comment (lines 11–14) states the
hazard: the `InviteMember` step "defaults an absent `orgRole` to `member`, so a resend that omitted it
would quietly strip the org authority the invitation was created with." The pending-panel resend
(`pages/invite.yaml`) sends `org_role`; **the Invitations-list resend button (`all_invitations_table.yaml`)
does not** — it sends `email`, `roles`, `member_attributes` only. So resending a pending `admin` or
`owner` invitation from the list silently downgrades it to `member` and reports success. The two
paths disagree, and the list path is wrong.

The invitation row cannot simply carry the tier for the caller to re-send: `invitations_base.yaml`
produces no org-tier alias, and `row-contract.md` states `org_role` is deliberately **not** on the
Invitations row. So the fix is server-side. `resend-invitation.yaml` reads the existing invitation
(a `MongoDBFindOne`, as `check-invite-email.yaml` already does) and **defaults `orgRole`, `appRoles`
and `attributes` to the stored values** when the payload omits them. Every resend caller becomes
correct-by-construction: no caller can blank or downgrade by forgetting a field, which is the "one
correct way / mandatory over opt-in" principle. The invitation-row contract stays unchanged — the
tier stays off the wire.

This closes a second, quieter defect in the same endpoint: `appRoles` and `attributes` are also
built as `_if_none: [{ _payload: … }, []]` / `{}`, so an absent payload today writes `[]` / `{}` and
blanks them. They currently work only because the callers prefill from `role_ids` / `member_attributes`
aliases that happen to be populated — a preserve-by-convention that the server-side default replaces
with a preserve-by-construction.

Rejected — carry `org_role` on the invitation row and fix the list button. It matches the existing
prefill-from-row pattern, but keeps correctness opt-in (a future caller can still forget the field),
and widens the published row contract for a value the row deliberately excludes.

### D7. The role-filter index is documented, and its use is confirmed

The migration shipped the performance change — `get_all_members.yaml` emits the roles clause as a
pre-join `$match` ahead of the `$lookup`s — but not the thing that makes it pay off: the compound
index it depends on is documented **nowhere**. There is no `docs/user-admin/reference/indexes.md`, and
`docs/user-admin/index.md` does not mention it. So a host app has no way to know it should create
`user-members { organizationId: 1, appRoles: 1 }`, and the "most expensive read" falls back to the
full scan the pre-join `$match` exists to prevent — silently, in production.

The output is a **new `docs/user-admin/reference/indexes.md`**, linked from `index.md`, matching the
sibling modules (`user-account`, `workflows`) that each have one. The framing is those siblings' own:
_"The module does not create indexes — index creation is a host-app concern"_ — the module documents
the contract, the app owns creating it. A new docs page means a `pnpm docs:gen` regen (it feeds
`docs/llms.txt`, and `docs:check` fails CI on drift). The filter still works without the index; this
is a performance requirement, not a correctness one, which is what makes documenting it a sufficient
answer.

Two things the general migration got subtly and must be nailed down:

- **The pre-join `$match` emits `{ appRoles: { $in: … } }` alone**, without `organizationId`, relying
  on MongoDB coalescing it with the base's adjacent `$match: { organizationId }` so the compound index
  serves the pair. org-authority Decision 11 chose this deliberately (repeating `organizationId` would
  be redundant). It should coalesce — both matches are on the member root, adjacent, ahead of the
  joins — but because the entire point is index usage, this design **confirms it with an `explain`
  plan** on the filtered read rather than trusting the planner, and records the result. If the plan
  shows a `COLLSCAN` or an `appRoles`-only index, the `organizationId` key goes back into the stage.
- **The field names are physical and adapter-derived.** The sibling upstream
  [snake-case-data-fields](../../../../lowdefy-design/designs/auth-upgrade/features/snake-case-data-fields/design.md)
  renames every auth column to snake_case; it has **not** landed, so `organizationId` / `appRoles` are
  correct today. But an index on camelCase keys against a collection whose columns are
  `organization_id` / `app_roles` is never used — the same silent full scan. So `indexes.md` states
  the names are the physical adapter-derived columns and is regenerated with the snake-case names when
  that design lands.

### D-alias. Both raw-id aliases are dropped; `roles` is the single roles surface

The module publishes the member's app-role ids under **three** names: `roles_arr` (from
`members_base.yaml` / `invitations_base.yaml`), `role_ids` (a duplicate id array, added in both
`get_user_detail.yaml` and `invitations_base.yaml`), and `roles` (the same ids resolved against the
catalog into objects). `roles_arr` and `role_ids` are the identical raw id array under two names — two
paths to one value, which `close_row.yaml`'s rule 2 forbids in its own words ("the row never offers two
paths to one value"), on the terminal stage shared by **every** members and invitations read.

**Both raw-id aliases are dropped. `roles` — now carrying `id` per entry (D4) — is the single roles
surface.** This reverses org-authority Decision 11, which kept `roles_arr` as a published contract
field on the premise that a consumer app binds `table_columns` / `download_columns` to the raw ids.
That premise is false for this module: consumers bind their own custom attributes, and roles already
display through the resolved `roles` column on the table and the export — so nothing external reads the
raw arrays. And once D4 puts `id` on each resolved entry, nothing internal needs them either: every id
the module uses is derivable from `roles`.

The two internal readers move to `roles`, and both get simpler:

- **The access-modal seed** (`modal_access.yaml`) currently reads `get_user_detail.0.role_ids`. It
  seeds from `roles` mapped to its `id`s instead — the same array `orphan_ids` is filtered from, so the
  picker seed and the orphan options come from one source and cannot disagree.
- **The Invitations-list Resend button** (`all_invitations_table.yaml`) currently sends
  `roles: { _event: row.role_ids }`. It stops sending roles entirely: D-resend makes
  `resend-invitation.yaml` default `appRoles` from the stored invitation server-side, so the button
  needs only `email` and the endpoint preserves the roles by construction.

Then `role_ids` and `roles_arr` leave `get_user_detail.yaml`, `members_base.yaml` and
`invitations_base.yaml`; `close_row.yaml`'s rule 2 reduces to a single roles path
(`appRoles → roles`); and `row-contract.md` documents `roles` as the one roles binding, recording the
Decision 11 reversal (see Files changed).

Rejected — keep `roles_arr` as the sole id array (dropping only the `role_ids` duplicate). It removes
the two-paths violation but leaves a raw-id field on the wire that no consumer binds and no internal
reader needs once `roles` carries `id`. A field shipped and documented for a phantom consumer is the
surface this design is trying to shed, not preserve.

## Current state

### The blank chip is index-based option matching

`MultipleSelector` does not hand Ant Design the selected values. `getSelectedIndex` converts each value
to the **string index** of its matching option and yields `undefined` when nothing matches
(`getSelectedIndex.js:37-43`). So with the picker seeded from `role_ids = ['old','viewer']` but
`options` built from the catalog alone, `['old','viewer']` reaches Ant Design as `[undefined,'0']`.

rc-select keeps that entry as `{ label: undefined, value: undefined }`, and the block's custom
`tagRender` — active because the options carry `tag:` — renders `title: label ?? ''`, spreading
`option?.tag` over it. For an unmatched value `uniqueValueOptions[props.value]` is `undefined`, so
there is no `tag` to spread and the title stays `''`. Hence a closable pill with no text.

The string `old` never reaches the dropdown at all. That is why injecting the held orphans into
`options` (D1) is the fix rather than a cosmetic patch: it gives the value an index, and every
downstream lookup resolves.

### The same indexing deletes the orphan silently

`onChange` maps Ant Design's returned selection back through `uniqueValueOptions[nv]`:

```js
val.push(
  type.isPrimitive(uniqueValueOptions[nv])
    ? uniqueValueOptions[nv]
    : uniqueValueOptions[nv].value,
);
```

For the orphan that index is `undefined`, the lookup finds nothing, and because
`type.isPrimitive(undefined)` is `true` it does not throw — it pushes `undefined` into state. So an
admin who adds or removes any **other** role submits `[undefined, 'viewer']`. Under the native array
write that reaches the adapter as a literal `null` inside the array — worse, not better. The options
fix (D1) is what removes it: with the orphan as an option it has an index, `onChange` resolves it, and
it round-trips as its real id.

This is the bug the migration's comment claims does not exist. It ships today.

### Descriptions render in the picker and nowhere else

The catalog normalizes to `{ id, label, description }` (`buildRoleCatalog.js`), and the access-modal
picker already builds a two-line option label from it (verified in `view.json`). Three places do not
get it — the view chips (`tile_attributes.yaml` renders `r.label` only), the roles filter
(`all_members_filters.yaml` maps to a plain `{ value, label }`), and option search (`filterString` is
the label only, so typing a description word matches nothing). All three are blocked on
`roles_from_catalog.yaml` carrying `description`, which it does not — it emits only `{ label, orphan }`
(D4).

### The stale gap notes

`roles_from_catalog.yaml`, `all_members_filters.yaml` and `invite_form.yaml` each carry the
`NOTE (running-engine gap)` disproved in D5-notes. They matter beyond tidiness: they are why the
rendered picker's description support read as unbuilt when it is built, and why nobody re-checked the
description surfaces.

### `required: true` on the role selectors validates nothing, but draws an asterisk

`modal_access.yaml` and `invite_form.yaml` both set it on the role `MultipleSelector`. As D6 explains,
`required` compiles to a null check that an array value can never fail, so it is inert as validation
and wrong as rendering.

## Proposed config

### `roles_from_catalog.yaml` — `id` and `description` per resolved entry, gap note gone

Each entry gains `id` and `description`; the stale gap NOTE is deleted:

```yaml
$addFields:
  roles:
    $map:
      input:
        $ifNull:
          - "$appRoles"
          - []
      as: rid
      in:
        id: "$$rid"
        label: # $let over the catalog, unchanged
        description: # the same $let, reading $$hit.description, $ifNull → null
        orphan: # unchanged
```

`description` resolves to `null` for a role with none and for an orphan, which is what the tooltip and
the option label already handle.

### `get_user_detail.yaml` — `orphan_ids` in, `role_ids` out

`role_ids` is dropped (D-alias); `roles_arr` is dropped from the shared `members_base.yaml` it rides in
on (below). `has_orphan` stays, and `orphan_ids` is added alongside it, from the same resolved `roles`
array `has_orphan` reads, so the two cannot disagree:

```yaml
# The member's held role ids the catalog no longer declares. Seeds the access
# modal's orphan selector options.
orphan_ids:
  $map:
    input:
      $filter:
        input: "$roles"
        as: r
        cond: "$$r.orphan"
    as: r
    in: "$$r.id"
```

### `modal_access.yaml` — seed, orphan options, no `required`

Seed the picker by mapping `get_user_detail.0.roles` to its `id`s (`roles` now carries `id` per entry,
D4) rather than reading a raw id array; concatenate the held orphans onto the catalog options; drop
`required: true`:

```yaml
# SetState seed — the picker's value is the array of held ids.
roles:
  _array.map:
    on:
      _request: get_user_detail.0.roles
    callback:
      _function:
        __args: 0.id
```

```yaml
options:
  _build.array.concat:
    -  # existing _build.array.map over _build.authConfig.roles — unchanged
    - _build.array.map:
        on:
          _request: get_user_detail.0.orphan_ids
        callback:
          _build.function:
            value:
              __build.args: 0
            filterString:
              __build.args: 0
            tag:
              title:
                __build.string.concat:
                  - __build.args: 0
                  - " (no longer configured)"
            label:
              __build.string.concat:
                - '<div style="line-height:1.3"><div>'
                - __build.args: 0
                - " (no longer configured)</div></div>"
```

Same entry shape as a catalog option, so the chip and the dropdown row render through the existing
paths. The orphan option has no description subtitle — there is no catalog entry to read one from,
which is the point the label is making. The `has_orphan` hint copy already reads well; if reworded, it
should state that the save works ("You can save as-is, or remove it — once removed it cannot be added
back").

### `members_base.yaml` / `invitations_base.yaml` / `close_row.yaml` — raw-id aliases dropped

`roles_arr` and `role_ids` are removed from both base stages (`members_base.yaml`, `invitations_base.yaml`)
and from `get_user_detail.yaml`. `roles` — the resolved array — stays as the single roles field. In
`close_row.yaml`, rule 2's alias list drops the two raw-id names, leaving `appRoles → roles`, and the
header comment loses the "two published wire names" framing. The `$unset` list is unchanged: it already
strips `appRoles`, and neither alias needs unsetting once it is never added.

### `filterString` carries the description

In both pickers and the filter selector, so search matches either:

```yaml
filterString:
  __build.string.concat:
    - __build.args: 0.label
    - " "
    - __build.if_none:
        - __build.args: 0.description
        - ""
```

### `all_members_filters.yaml` — rich label, `tag`, `filterString`, gap note gone

The filter's `options` gain the two-line label, `tag: { title: label }`, and the `filterString`
above; the stale gap NOTE is deleted (D4, D5-notes).

### `tile_attributes.yaml` — description tooltip

The ordinary chip's `<span>` gains `title="{{ r.description }}"`. A `null` description renders as an
empty attribute — no tooltip — so no `{% if %}` is needed. The stale `on:` comment ("Roles split from
member.role") is corrected: roles come from `appRoles`, catalog-resolved.

### `resend-invitation.yaml` — server-side preserve

A `MongoDBFindOne` reads the existing invitation, and the `InviteMember` step defaults each preserved
field to the stored value:

```yaml
- id: find_invitation
  type: MongoDBFindOne
  # scoped { email, organizationId: org_slug, status: pending }, projecting
  # appRoles, role, attributes
- id: resend
  type: InviteMember
  properties:
    email: { _payload: email }
    organizationId: { _module.var: org_slug }
    appRoles:
      _if_none:
        - _payload: roles
        - _request: find_invitation.appRoles
    orgRole:
      _if_none:
        - _payload: org_role
        - _if_none: [{ _request: find_invitation.role }, member]
    attributes:
      _if_none:
        - _payload: member_attributes
        - _request: find_invitation.attributes
    resend: true
```

The list Resend button (`all_invitations_table.yaml`) currently sends `roles: { _event: row.role_ids }`.
D-alias removes `role_ids` from the invitations row, so that binding goes: with the server-side default
in place the button sends only `email` (and its other existing fields), and the endpoint preserves the
roles by construction. Its comment claiming it "re-send[s] them rather than blank them" is corrected —
the endpoint, not the caller, is now what preserves.

### `all_members_table.yaml` — dead branch and stale comments

The `{% elif r.primary %}` branch renders a purple pill for a `primary` field `roles_from_catalog`
never produces and nothing defines — dead today, removed here since this design respecifies the
resolved-entry shape. The Roles column's two entry-shape comments (lines 40 and 81) still describe the
row as `{ label, orphan }`; they are updated to the resolved shape this design produces — entries are
`{ id, label, description, orphan }`, resolved against the catalog, orphans flagged. (The earlier
`$split` / task-number comments review-2 flagged are already gone from this file.)

### Comment cleanup

The journey/task-number and stale-model comments the migration left: `api/invite.yaml` (task-5),
`api/suspend.yaml` (task-13), `api/update-access.yaml` ("array-only … never a CSV", framed against the
removed model), and `close_row.yaml` (frames `role` as never-published though `get_user_detail` aliases
it to `org_role`). Per the repo comment rule, a comment describes the current code, not the journey to
it.

## Files changed

| File                                                         | Change                                                                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/user-admin/requests/stages/roles_from_catalog.yaml` | add `id` + `description`; delete the stale gap NOTE                                                                                                                     |
| `modules/user-admin/requests/get_user_detail.yaml`           | drop `role_ids`, add `orphan_ids` (D-alias, D1)                                                                                                                         |
| `modules/user-admin/requests/stages/members_base.yaml`       | drop the `roles_arr` alias (D-alias)                                                                                                                                    |
| `modules/user-admin/requests/stages/invitations_base.yaml`   | drop the `roles_arr` and `role_ids` aliases; fix the header comment (D-alias)                                                                                           |
| `modules/user-admin/requests/stages/close_row.yaml`          | rule 2 alias-map drops the raw-id names (`appRoles → roles`); correct the `role` framing (D-alias, comments)                                                            |
| `modules/user-admin/components/view/modal_access.yaml`       | seed by mapping `roles` → ids, concat orphan options, drop `required`, hint copy                                                                                        |
| `modules/user-admin/components/view/tile_attributes.yaml`    | `title=` description tooltip on the ordinary chip; fix the stale `on:` comment                                                                                          |
| `modules/user-admin/components/invite_form.yaml`             | `filterString` + description; drop `required`; delete the stale gap NOTE                                                                                                |
| `modules/user-admin/components/all_members_filters.yaml`     | rich two-line options **+ `tag: { title: label }`**, `filterString` + description; delete the stale gap NOTE                                                            |
| `modules/user-admin/components/all_members_table.yaml`       | drop the dead `{% elif r.primary %}` branch; update the `{ label, orphan }` entry-shape comments to the resolved shape                                                  |
| `modules/user-admin/components/all_invitations_table.yaml`   | drop the `roles: row.role_ids` Resend payload; correct the "re-send rather than blank" comment (D-alias, D-resend)                                                      |
| `modules/user-admin/api/resend-invitation.yaml`              | add `find_invitation`; default `orgRole` / `appRoles` / `attributes` to stored (D-resend)                                                                               |
| `modules/user-admin/api/invite.yaml`                         | cut the task-5 journey comment                                                                                                                                          |
| `modules/user-admin/api/suspend.yaml`                        | cut the task-13 journey comment                                                                                                                                         |
| `modules/user-admin/api/update-access.yaml`                  | cut the stale "never a CSV" comment                                                                                                                                     |
| `docs/user-admin/reference/indexes.md`                       | **new page** — the module-owned role-filter index, host-app-creates framing, physical names (D7)                                                                        |
| `docs/user-admin/index.md`                                   | link the new indexes page                                                                                                                                               |
| `docs/user-admin/reference/row-contract.md`                  | drop `roles_arr` + `role_ids` entirely (members and invitations); `roles` becomes the one roles binding and gains `id` + `description`; record the Decision 11 reversal |
| `docs/llms.txt`                                              | regenerated via `pnpm docs:gen` after the new page (`docs:check` fails CI on drift)                                                                                     |
| `apps/demo/`                                                 | a worked example / verification path for an orphan-holding member (see Verification)                                                                                    |

## Verification

`pnpm ldf:b` covers the config, and the built artifacts are worth inspecting rather than trusting —
that is how the stale gap notes were caught. Check `pages/user-admin/view.json` for the resolved
option labels (catalog + orphan concat) and `pages/user-admin/all.json` for the filter's.

**The index (D7).** Run `explain` on the filtered members read against real data and confirm the
compound `{ organizationId: 1, appRoles: 1 }` index serves it (not a `COLLSCAN` or an
`appRoles`-only index). Record the result in the design; if it does not coalesce, put `organizationId`
back into the pre-join stage. Also exercise the filter set and unset — unset must leave the stage as a
match-all, set must return the same rows as before.

**The resend downgrade (D-resend).** Resend a pending `admin`/`owner` invitation **from both callers —
the Invitations table and the invite page's pending panel — with each payload field omitted in turn**,
and read the invitation's `role` / `appRoles` / `attributes` back unchanged each time. This is the bug
the migration shipped; it must not survive on either path.

The behavioural checks belong on the rig — the auth-testing campaign
([`../auth-testing/`](../auth-testing/design.md)) — since an orphan is a data state. Against a member
holding a role removed from the demo catalog:

- the tile shows a flagged `⚑ <id>` chip; an ordinary chip shows its description on hover;
- the picker shows `<id> (no longer configured)`, closable, **with text** (not a blank chip);
- saving with it selected **succeeds**, and reading back shows the orphan still held;
- adding an unrelated role while it is selected saves both — no `null` reaches `appRoles`;
- removing it and saving succeeds, and it is then absent from the picker's options;
- attributes save in every one of the above, including with the orphan present;
- typing a word from a role's description finds that role in the picker and in the roles filter.

**The dropped aliases (D-alias).** In the built `view.json` / `all.json` and a live row, confirm neither
`roles_arr` nor `role_ids` appears on any members or invitations row — `roles` is the only roles field.
Confirm the access modal still opens with the member's current roles pre-selected (the seed now maps
`roles` → ids), and that a Resend from the Invitations list re-sends the invitation's app roles intact
(the button no longer carries them; the endpoint preserves them). The roles column and export are
unchanged, since both already render the resolved `roles`.

## Non-goals

- **Other contract fields.** D-alias drops the raw-id aliases `roles_arr` / `role_ids` (superseding
  org-authority Decision 11 — see D-alias), but touches no other row-contract field: `member_attributes`,
  `profile`, the change stamps, the invitation-only keys and the `org_role` tier all stand.
- **The org-authority grant surface.** The `org_role` selector, `UpdateMemberOrgRole` and the
  `org_authority` var shipped with the migration. This design corrects only the resend path (D-resend);
  it does not touch the grant UI.
- **Cleanup of orphaned ids across data, or any way to enumerate orphan-holders.** Removing a role from
  config is deliberate and does not mutate stored data; the repair is a data migration run by the app,
  on the same footing as index creation (D7). The module's orphan affordances are an anomaly indicator,
  not a cleanup tool (D2). The roles filter's options are catalog ids only, so the one role you would
  filter on is the one you cannot select — the answer is a visual scan of the flagged `⚑` chips,
  accepted at the module's stated sizing.
- **Repairing `required: true` for array inputs generally.** A real engine wart — `required` compiles
  to a null check, inert on every array input. This design only stops the module relying on it (D6).
- **Descriptions on the selected chip.** D4.
- **A migration mechanism / creating the index.** D7 — the index is documented, not provisioned.
