# Roles on `member.appRoles`

The module reads and writes the app's roles as a comma-separated string on `member.role`, shared
with BetterAuth's own `owner`/`admin`/`member` tier. Upstream
[role-storage](../../../../lowdefy-design/designs/auth-upgrade/features/role-storage/design.md) moves
Lowdefy roles to their own `string[]` field, `member.appRoles`, and leaves `member.role` to
BetterAuth. This design is the module's side of that: every `$split` goes, the role filter becomes
indexable, and the role picker's orphan handling collapses to one mechanism.

It also carries three roles-UX fixes that have been sitting behind the storage work: the picker
renders a blank chip for a role the catalog no longer declares (and silently deletes it on save),
role descriptions never reach the view chips or the roles filter, and `required: true` on both role
selectors draws an asterisk behind a rule that cannot fire.

## Proposed change

1. **Read `appRoles` directly.** Delete the `$split` in `members_base.yaml` and
   `invitations_base.yaml`, the `$ne: ''` filters that only exist because `$split('')` yields
   `['']`, the two `$reduce`s in `get_users_excel_data.yaml`, and the JavaScript split in
   `invite.yaml`. `roles_from_catalog.yaml` takes `$appRoles` as its input.
2. **Drop the `roles_arr` and `role_ids` aliases** and put `appRoles` on the wire row instead. Once
   storage is an array both are pure renames of one stored field, which `close_row.yaml`'s own rule
   forbids (D5).
3. **Make the role filter indexable** — prepend the roles clause as a standalone `$match` on
   `{ organizationId, appRoles }` at stage 0 of `get_all_members.yaml`, ahead of the `$lookup`s,
   leaving search and status in the post-lookup match. Document the module-owned index
   `user-members { organizationId: 1, appRoles: 1 }` in `docs/user-admin/reference/indexes.md`.
4. **Write an array, not a CSV.** All three role-write paths — `update-access.yaml`, `invite.yaml`
   and `resend-invitation.yaml` — drop their `_array.join` and pass the picker's array straight
   through. `check-invite-email.yaml` projects `appRoles` so the resend caller has one to send.
5. **The picker offers the catalog plus the member's held orphans.** One change fixes both the blank
   chip and the silent deletion — they are the same unmatched-value bug. No validation rule: a save
   carrying an untouched orphan succeeds, and removing one is permanent because the option came from
   the read (D1, D2).
6. **Role descriptions reach the three places they are missing** — the view chips, the roles filter,
   and option search (D4).
7. **Delete `required: true`** from both role selectors. It validates nothing and the asterisk it
   draws is wrong (D6).
8. **Delete three stale `NOTE (running-engine gap)` comments** claiming `_build.authConfig` does not
   resolve in module config. It does, and has for some time — verified in the built artifact.
9. Retire the two impossible clauses of `user-admin` Decision 8, record the host-app-creates index
   position against role-storage Decision 6, and update `docs/` — including a new
   `docs/user-admin/reference/indexes.md` and a `pnpm docs:gen` regen.

## What the storage split removes

This design replaces a much larger one. The previous version fixed the picker while working around
`ROLE_NOT_FOUND`, and almost all of that machinery was a consequence of app roles sharing
`member.role` with a registered role tier. role-storage Decision 4 retires the registration, so:

- **Both upstream asks are gone.** The message-less 400 on an empty role set came from
  `updateMemberRole`'s two empty guards (`crud-members.mjs:252`, `:257`); an adapter-direct
  `appRoles` write has no guards to trip. The `applyPinnedPolicy` hook writing `role: 'member'` is
  now upstream's own fix, and it stops mattering here either way — `createAutoJoinHook` and
  `applyPinnedPolicy` both write no `appRoles`, so a self-signed-up member holds no roles rather
  than an orphaned `'member'`.
- **The orphan-blocking gate is gone**, along with the argument that took three review rounds to
  settle. That gate existed because re-submitting an untouched orphan failed the write. It no longer
  does.
- **Orphans revert to one source.** Removing a role from `auth.roles` leaves every member who held
  it carrying an id the app no longer declares. Rare, deliberate, and the admin who did it can
  expect the consequence — which is what the original design assumed before the open-signup source
  was found.

`review/review-1.md` findings 2, 3 and 4 are all about that open-signup population and the deadlock
it created. They are answered by the storage split rather than by anything in this design. Findings
1, 5 and 6 concern the picker and survive in some form; see D3, D5 and D6.

## Current state

### Where the CSV lives

`member.role` is a `required: true` string on the organization plugin's member model, holding the
app's roles comma-joined. The module splits it in two shared base stages and consumes the result
downstream **by name**:

| Site                              | What it does                                                              |
| --------------------------------- | ------------------------------------------------------------------------- |
| `members_base.yaml:57`            | `roles_arr: $split($role, ',')`                                           |
| `invitations_base.yaml:26`        | the same, for `invitation.role`                                           |
| `invitations_base.yaml:33`        | `role_ids` — a second split, with empties filtered                        |
| `roles_from_catalog.yaml:22`      | resolves each `roles_arr` id against the catalog → `{ label, orphan }`    |
| `get_user_detail.yaml:58`         | `role_ids` — `roles_arr` with empties filtered                            |
| `members_filter.yaml:45`          | `$in` on `roles_arr`, post-`$lookup`                                      |
| `get_users_excel_data.yaml:35,66` | `$reduce` back to a display CSV, in both the member and invitation branch |
| `pages/invite.yaml:196`           | a client-side split of the resolved invitation's role string              |

Three further sites hold the CSV on the **write** side, outside the `roles_arr` chain:
`update-access.yaml`, `api/invite.yaml:133-136` and `api/resend-invitation.yaml:17-22` each
`_array.join` the picker's array back to a string, and `check-invite-email.yaml:101` projects `role` so
the page row above has something to split.

The `get_user_detail` and `get_users_excel_data` rows are the dangerous ones: `roles_arr` is
produced in a shared base stage and read downstream by name, so deleting it without repointing them
fails **silently**. `$ifNull` turns each read into `[]`, and the picker and the export's roles column
go empty with no error. `role_ids` in particular seeds the update-access payload, so a silent `[]`
there is a save that wipes the roles it was meant to preserve.

### The blank chip is index-based option matching

`MultipleSelector` does not hand Ant Design the selected values. `getSelectedIndex` converts each
value to the **string index** of its matching option and yields `undefined` when nothing matches
(`getSelectedIndex.js:37-43`). So `['old','viewer']` reaches Ant Design as `[undefined,'0']`.

rc-select keeps that entry as `{ label: undefined, value: undefined }`, and the block's custom
`tagRender` — active because the options carry `tag:`, which sets `hasTagStyling` — renders
`title: label ?? ''`, spreading `option?.tag` over it. For an unmatched value
`uniqueValueOptions[props.value]` is `undefined`, so there is no `tag` to spread and the title stays
`''`. Hence a closable pill with no text.

The string `old` never reaches the dropdown at all. That is why injecting orphans into `options` is
the fix rather than a cosmetic patch: it gives the value an index, and every downstream lookup
resolves.

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
`type.isPrimitive(undefined)` is `true` it does not throw — it pushes `undefined` into state.

So an admin who adds or removes any **other** role submits `[undefined, 'viewer']`. `_array.join`
renders `undefined` as an empty string, giving `",viewer"`; BetterAuth splits on commas and drops
empties, storing `"viewer"`. The orphan is gone, the save reports success, and nothing is shown to
the admin.

This survives the storage change on its own. Without the CSV join the payload is
`[undefined, 'viewer']` and reaches the adapter as a literal `null` inside the array — worse, not
better. The options fix is what removes it, in both storage models.

### Descriptions render in the picker and nowhere else

The catalog normalizes to `{ id, label, description }` (`buildRoleCatalog.js`), and both role
pickers already build a two-line option label from it. Verified in the built artifact
(`.lowdefy/server/build/pages/user-admin/view.json`):

```html
<div style="line-height:1.3">
  <div>User Admin</div>
  <div style="font-size:11px;color:var(--ant-color-text-tertiary)">
    Administers users across the pinned suite (ban, invite, roles, sessions).
  </div>
</div>
```

`MultipleSelector` renders an option's label through `renderHtml({ html: opt.label })`, so that is
markup, not escaped text. Three places do not get it:

- **The view chips.** `tile_attributes.yaml` renders `r.label` only; the orphan branch carries a
  `title=` tooltip, the ordinary branch none.
- **The roles filter.** `all_members_filters.yaml:59-66` maps the catalog to a plain
  `{ value, label }`.
- **Option search.** `filterOption` reads `option.filterstring || option.children.props.html`. The
  fallback would match description text, but `filterString` is set to the label, so it wins and
  typing a word from a description matches nothing.

### The three stale gap notes

`roles_from_catalog.yaml:10-14`, `all_members_filters.yaml:53-58` and `invite_form.yaml:61-64` each
carry a `NOTE (running-engine gap)` saying `_build.authConfig` is unavailable to module config and
throws "cannot be used inside the auth block". That is false. `resolveAuthConfigProjection` runs as a
scoped pre-pass before the main `buildRefs` walk precisely so the operator resolves in module config
downstream, the engine carries a build test for it
(`packages/build/src/tests/success/97-module-authconfig-projection/`), and the built demo page has
all four catalog roles with their descriptions baked in.

The notes matter beyond tidiness: they are why nobody has looked at the rendered picker, and why the
description work read as unbuilt rather than built.

### `required: true` on the role selectors validates nothing, but does draw an asterisk

`modal_access.yaml:56` and `invite_form.yaml:50` both set it. Lowdefy compiles `required` into
exactly one rule, `pass: { _not: { _type: 'none' } }`. A `MultipleSelector`'s value is always an
array — empty when unset — and `[]` is not `none`, so the rule can never fail. `required: true` on
any array-valued input is inert **as validation**, independent of storage and independent of whether
the modal's `Validate` action is wired correctly (D3).

It is not inert as rendering. The block forwards `required` to `Label`
(`MultipleSelector.js:81-85`), which sets Ant Design's `ant-form-item-required` class and draws the
red asterisk. That applies to both label spellings in use — `properties.label.title` in the modal,
`properties.title` on the invite form.

### The design contradiction

`designs/user-admin-better-auth/design.md` Decision 8 asserts both that an orphan is "never silently
stripped" and that "a role save submits only catalog-valid ids … so an untouched orphan can't fail
the write", and also that an orphan is "removable, but not addable back".

The role write is a **replace**, so sending only the valid ids _is_ deleting the orphan: clause 2 is
a description of clause 1 being broken. Neither is implemented — `modal_access.yaml:18` and
`update-access.yaml:5-6` both claim the UI submits only catalog-valid ids; nothing filters.

The third clause survives this design, for a different reason than it was written for (D1).

## Key decisions

### D1. Options are the catalog plus the member's held orphans

The selector offers `catalog ids ∪ appRoles` — ordinary, enabled options labelled
`<id> (no longer configured)`. Two properties fall out rather than needing enforcement:

**An orphan can be removed.** The tempting variant is `disabled: true`, so it renders but cannot be
re-selected. That does not work: rc-select computes a tag's closable flag as
`closable = !disabled && !itemDisabled` (`SelectInput/Content/MultipleContent.js:109`), so a
disabled option produces a **non-removable** chip. It would label the orphan and simultaneously trap
it. Removing one by hand is a convenience rather than the cleanup path (D2), but trapping it is still
strictly worse than not, and an ordinary enabled option is also less config: the same entry shape as a
catalog option, through the same render path, with no flag to explain.

**It cannot be added back once removed.** The orphan options come from the detail read, so after
removing one and saving, the refetch drops it from the member's `appRoles`, it is no longer an
option, and there is no way to re-enter it. Within a single unsaved session it can be re-selected,
which is harmless — the member already holds it.

That is Decision 8's "removable, but not addable back" clause, delivered by where the option set
comes from rather than by a disabled flag or a validation rule. The admin is never offered a role
the app does not configure and no member holds.

### D2. Submitting a held orphan saves, and there is no validation rule

The picker submits whatever is selected. A save carrying an untouched orphan writes it back
unchanged. So:

- The orphan is never stripped — the data is preserved verbatim, which is what Decision 8 wanted and
  never got.
- Editing a member's **attributes** is never blocked by a role the app no longer configures. Both
  sit behind one Save button, and that button works.
- The UI is where the admin learns about it: a flagged chip on the tile, a `(no longer configured)`
  option in the picker, and a hint on the field.

**The orphan state is an anomaly indicator, not a workflow.** A role leaving `auth.roles` is rare and
deliberate, and the cleanup that follows is a **data migration run by the app**, not per-member
editing in this UI. So the module's job is to surface the anomaly — a flagged chip, a labelled
option, a hint — and then stay out of the way: the admin must be able to save the member without
being blocked, and removing the role by hand is a convenience for a one-off, not the sanctioned
cleanup path. That is what sizes every orphan affordance in this design; nothing here is built to
make bulk cleanup ergonomic, because bulk cleanup does not happen here (see Non-goals).

This is only sound because the write no longer rejects it, which is what role-storage Decision 4
delivers. See "What this needs from upstream".

Rejected: a `validate` rule failing while an orphan is selected. It buys nothing once the write
accepts the value, and it costs the attributes edit — the admin would have to resolve the role
before touching an unrelated field. Forcing that is a restriction with no harm to prevent: a
non-catalog id in `appRoles` grants nothing, because gate references are build-validated against the
catalog (role-catalog Decision 6.1), so no page or API can name it.

### D3. The modal's `Validate` action is left alone

`modal_access.yaml:25-27` runs `validate_access` with `params: modal_access`, the modal's own id,
which validates **nothing**. `getBlockMatcher` turns a bare string into an exact-`blockId` matcher
and only ever reads `blockIds`/`regex`; every block tests that matcher against its own `blockId` and
returns early; `Slots.getValidateRec` walks the tree but hands each block the same exact matcher, so
there is no cascade to descendants. `params: modal_access` matches one block — the Modal container,
which carries no `validate` entries — and yields zero errors.

That is a real defect, and the previous version of this design fixed it because its orphan rule
depended on it firing. With D2 there is no rule, so nothing here needs it. What it still suppresses
is the consumer's own `fields.member_attributes` rules, which is a module-wide validation problem:
the same container-id mistake sits in seven other forms, and fixing any of them makes dormant rules
start firing — correct, but user-visible, and needing verification that has nothing to do with
roles. It stays in Non-goals with all eight sites named, and the working form (`blockIds` + `regex`,
never the documented `blockId` spelling) is recorded there so the follow-up does not re-derive it.

### D4. Descriptions go to the view chips, the filter, and search — not the selected chip

The catalog already carries the text and the picker already renders it. The three gaps are filled the
cheapest way each allows:

- **View chips** — a `title=` tooltip on the ordinary chip, matching the tooltip the orphan chip
  already has. This needs `roles_from_catalog.yaml` to carry `description` alongside `label`.
- **Roles filter** — the same rich two-line label the pickers use, **plus the `tag: { title: label }`
  the pickers also carry.** The tag is not decoration here, it is what keeps the selected chip to one
  line. `filter.roles` (`all_members_filters.yaml:58-67`) sets neither `tag` nor `renderTags`, and
  `MultipleSelector` installs its custom `tagRender` only when `properties.renderTags ||
hasTagStyling`, where `hasTagStyling` is `opt.color || opt.tag` (`MultipleSelector.js:66,115`). With
  neither, antd's default tag renders the `Option`'s children — which are
  `renderHtml({ html: opt.label })` (`:227-233`), i.e. the whole two-line `<div>` with its description
  subtitle, inside a control the same file caps at `maxWidth: 260px`. Adding `tag` flips
  `hasTagStyling` on and routes the chip through `tagRender`'s `title`, exactly as in the two pickers.
  An admin filtering by role is asking the same question as an admin assigning one — and D4's own
  "compact pill in a form field" reasoning applies verbatim to the filter's chip.
- **Search** — `filterString` becomes label + description. Not by dropping `filterString` to reach
  `filterOption`'s HTML fallback: that string includes the inline styles, so `line-height`,
  `font-size` and `color` would all become matchable terms.

**The selected chip stays label-only.** `tag.title` is a compact pill in a form field, several to a
row; a description would not fit and there is nowhere to put a tooltip that does not fight the close
button. The dropdown is where the admin is choosing and where the explanation belongs.

A role with no `description` renders label-only everywhere, unchanged.

### D5. `roles_arr` and `role_ids` are dropped, not repointed

Both exist because storage is a string. `roles_arr` is the split; `role_ids` is the split with
empties filtered, which is only needed because `$split('')` returns `['']`. Once the stored field is
an array, repointing them makes each a pure alias of `appRoles`, and the row would offer three paths
to one value.

`close_row.yaml` already forbids that, in its own words: it unsets "every stored field that already
ships under a canonical alias, so the row never offers two paths to one value". Repointing would put
the module in breach of its own documented rule; dropping them satisfies it. So the wire row carries
`appRoles` (the ids) and `roles` (the catalog-resolved `{ id, label, description, orphan }[]`), and
nothing else.

**`member.role` is unset on the wire too.** It is not an alias — it is BetterAuth's org-admin tier, a
different field with a different meaning — but under `pinned` nothing writes anything but `''` to it,
so it carries no information a consumer can use, and shipping `role` beside `appRoles` is exactly the
one-character confusion role-storage Decision 1 rejected `member.roles` to avoid. A future
tenant-capable module re-exposes it deliberately; the module is pinned-only today (role-catalog
Decision 5).

### D6. `required: true` is removed, not repaired

The config expresses an intent the engine never enforced, and the intent is wrong: a member with no
roles is a supported state — `appRoles` is `required: false` and simply absent for a self-signed-up
member. Replacing it with a working array-aware rule would newly forbid something the platform
supports. Removing it stops the config lying.

**Both role fields lose their red asterisk**, and that is intended in both places. On
`modal_access.yaml` it follows from role-less members being legitimate. On `invite_form.yaml` it is
the same fact: an invite with an empty role array already mints a role-less member successfully, so
the asterisk marks a field the flow does not require, and a nudge the module's own write path
contradicts is worse than no nudge. If choosing roles at invite time should be mandatory, that needs
a real rule, in its own change.

The inert-`required`-on-array-inputs issue is an engine-level wart affecting every array input. Noted
in Non-goals and left alone.

### D7. The index is documented, not migrated — index creation is a host-app concern

role-storage Decision 6 provisions `user-members { organizationId: 1, appRoles: 1 }` as module-owned
and says the module creates it "in its own migration". **This design overrides that**, on an existing
repo convention rather than on missing machinery.

The convention is stated in those words: "The module does not create indexes — index creation is a
host-app concern" (`docs/user-account/reference/indexes.md:10`, `docs/workflows/reference/indexes.md:10`),
and inline in `docs/deals/index.md:57-59` — "The module documents the contract; the app owns creating
them." So documenting the index is what every other module in this repo does, not a concession this one
is making. (It is separately true that the repo has no data-migration runner — `scripts/` has none and
`docs/user-admin/how-to/migration.md` is a config-migration guide — but that is not the argument.)

The output therefore goes in a **new `docs/user-admin/reference/indexes.md`**, linked from
`docs/user-admin/index.md`, matching both sibling modules. Not a paragraph in `index.md`, which would
make `user-admin` the one module documenting an index inline. A new docs page means `pnpm docs:gen`
(it feeds `docs/llms.txt`, and `docs:check` fails CI on drift).

The filter still works without the index — this is a performance requirement, not a correctness one,
which is what makes documenting it a sufficient answer rather than a deferral.

**The field names are physical and adapter-derived.** The sibling upstream design
[snake-case-data-fields](../../../../lowdefy-design/designs/auth-upgrade/features/snake-case-data-fields/design.md)
renames every auth physical column to snake_case; role-storage spells out the consequence at
`design.md:179` — `appRoles → app_roles` falls out of its Decision 1 auto-derive alongside
`organizationId`. For the config sites that is inherited churn (the module already reads camelCase
`organizationId` and `userId`). For the **documented index** it is worse than churn: an index on
`{ organizationId: 1, appRoles: 1 }` against a collection whose columns are `organization_id` /
`app_roles` is not an error — it is simply never used, and the failure mode is the full scan this
decision exists to prevent, silently, in production. So the indexes page states that the names are the
physical adapter-derived columns, and is regenerated with the new names when that design lands.

## Proposed config

### The split stages become passthroughs

`members_base.yaml` drops `roles_arr` entirely; `appRoles` is already on the member root. Its header
comment loses the `roles_arr` line, and specifically the parenthetical "nothing reads a role array
from the DB", which is now false.

`invitations_base.yaml` drops both `roles_arr` and `role_ids` the same way.

`close_row.yaml` gains `role` in its `$unset` list, with a line in its rule #2 block naming it as
BetterAuth's tier rather than an alias.

### `roles_from_catalog.yaml` — three fields per resolved entry

Input becomes `$appRoles`, and the `$filter` dropping empty strings goes with the CSV. Each entry
gains `id` and `description`:

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

`id` is carried rather than reusing `label`: an unmatched entry's `label` falls back to the raw id
(`$ifNull: ["$$hit.label", "$$rid"]`), but that fallback exists to make the display chip readable.
The orphan option's `value:` is written to `appRoles`, so deriving it from a display default means a
future change to that default — "Unknown role", a prefix, a translated string — silently writes a
fabricated role id. One extra field removes the coupling.

`description` resolves to `null` for a role with none and for an orphan, which is what the tooltip
and the option label already handle.

### `get_user_detail.yaml` — one new field, one deletion

`role_ids` goes (D5). `has_orphan` stays as it is. Added alongside it:

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

`has_orphan` and `orphan_ids` both `$map` the same `roles[].orphan` flag from the one stage, so they
cannot disagree; re-expressing the hint gate as a length test would be more config for the same fact.

### `modal_access.yaml` — seed, options, hint

The seed reads `appRoles` instead of `role_ids`:

```yaml
roles:
  _request: get_user_detail.0.appRoles
```

The catalog mapping is unchanged; the orphan options concatenate onto it:

```yaml
options:
  _array.concat:
    -  # existing _build.array.map over _build.authConfig.roles — unchanged
    - _array.map:
        - _request: get_user_detail.0.orphan_ids
        - _function:
            value:
              __args: 0
            filterString:
              __args: 0
            tag:
              title:
                __string.concat:
                  - __args: 0
                  - " (no longer configured)"
            label:
              __string.concat:
                - '<div style="line-height:1.3"><div>'
                - __args: 0
                - " (no longer configured)</div></div>"
```

Same entry shape as a catalog option, so the chip and the dropdown row render through the existing
paths. The orphan option has no description subtitle — there is no catalog entry to read one from,
which is the point the label is making.

The `label.extra` hint gated on `has_orphan` currently reads "A role shown here that is no longer in
this app can be removed, but not added back." Half of that is still true (D1) and half now misleads
by omission — the admin should know the save works. It becomes: "This member holds a role this app no
longer configures. You can save as-is, or remove it — once removed it cannot be added back."

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

### The roles clause moves to stage 0 of `get_all_members.yaml`

The roles clause leaves `members_filter.yaml`'s post-`$lookup` `$match` and becomes its own
`{ organizationId, appRoles }` stage. Search and status stay where they are — both read joined fields
(`name`, `email`, and the `user.banned`-derived `status`), so they cannot move.

**It cannot be emitted from `members_filter.yaml`.** `members_base.yaml` holds the
`$match: { organizationId }` (`:30-32`) and both `$lookup`s (`:33-46`) in one file, and
`get_all_members.yaml:21-26` concatenates base and _then_ filter — so anything emitted from
`members_filter.yaml` lands after the joins by construction. The seam is in the caller, and the detail
read already demonstrates it: `get_user_detail.yaml:22-25` prepends its own `$match` **before** the
`_ref: requests/stages/members_base.yaml`. `get_all_members.yaml` does the same, putting the roles
`$match` at stage 0, ahead of the org-scope match. No new stage file, and no split of a base shared
with two other reads.

Two properties of that stage:

- **It is unconditional.** The pipeline is fixed at build time; only the `$match` body varies at
  runtime. So it needs the same `_object.assign` / match-all treatment `members_filter.yaml:14-18`
  uses — with no roles filter set it must reduce to `$match: { organizationId }`, never an invalid or
  empty-`$and` stage.
- **The `organizationId` key in it is load-bearing**, not redundant with the base's own org match. It
  is the prefix that makes `{ organizationId: 1, appRoles: 1 }` usable; without it the stage can only
  use an `appRoles`-only index, which the module does not document.

The stage is emitted explicitly rather than left to MongoDB's optimizer. `appRoles` is on the member
root, so the optimizer _may_ push a `$match` on it ahead of a `$lookup`, but the module's most
expensive read should not depend on planner behaviour.

The header comment's "EXACT split-array element match … never a substring/regex over the raw CSV (so
`admin` does not match `super-admin`)" describes a hazard that no longer exists. `$in` on a native
array is exact by construction; the comment goes rather than being reworded, since there is no
tempting wrong alternative left to warn about.

### The write side passes arrays

`update-access.yaml`:

```yaml
- id: set_roles
  type: UpdateMemberRoles
  properties:
    memberId:
      _payload: member_id
    roles:
      _if_none:
        - _payload: roles
        - []
```

`api/invite.yaml`'s `invite_member` step (`:133-136`) and `api/resend-invitation.yaml`'s `resend` step
(`:17-22`) the same way. Resend is the module's **third** role-write path and the easiest to miss: it
calls the same `InviteMember` step, so leaving its `_array.join` in place either fails the build under
the array contract or keeps writing a CSV.

`update-access.yaml`'s header comment loses the whole "roles submitted must be catalog-valid ids
only" paragraph and the "`role` is a comma-separated string … joined to CSV here" paragraph.
`resend-invitation.yaml`'s payload comment (`:8`) already says "array of catalog ids", so only the
step body changes there.

#### The resend caller has no `appRoles` to send

The client-side CSV split is on **`pages/invite.yaml:196`**, not `api/invite.yaml` — the pending
panel's resend builds its payload with
`_js: state('resolved_invitation.role').split(',')`. Deleting that split is not sufficient, because
`resolved_invitation.appRoles` **does not exist**: `check-invite-email.yaml`'s `find_invitation` is a
`MongoDBFindOne` with an explicit projection (`:98-107`) listing `role: 1` and no `appRoles`.

So the projection is the load-bearing change. Without it the split's replacement reads `undefined`,
the resend posts `roles: []`, and the invitation's roles are blanked with a success message — the same
silent-empty class as the `role_ids` hazard above, on a path that reports success. `find_member`'s
`role: 1` at `:68` goes too: nothing reads `resolved_member.role`, and leaving it is a third path to a
field this design is unsetting from the wire (D5).

The invitations table's resend (`all_invitations_table.yaml:136`) reads `row.appRoles` off the list
row, which `invitations_base.yaml` already carries — that caller only needs the field name change.

### `get_users_excel_data.yaml`

Both `$reduce`s — the member branch at `:35` and the invitation branch at `:66` — read `$appRoles`
and drop their empty-string `$filter`. The display CSV they produce is unchanged; it is an export
column, not storage.

### `all_members_table.yaml` — three stale comments and a dead branch

The list's Roles column narrates a split that no longer happens, in three places, two of which are
journey comments naming a task number and so ruled out by the repo's comment rule independently of this
change:

- `:5` "The real read (split roles, derive status, org scope, paginate) is task 9." — the read is real;
  delete the line.
- `:41-44` "Roles come split (Decision 1) … task 9 authors the `$split` + catalog reconcile that
  produces them." — reduces to what the renderer needs to know: entries are
  `{ id, label, description, orphan }`, resolved against the catalog, orphans flagged.
- `:82` "roles split + resolved against the catalog (`{ label, orphan }`)" — the shape is wrong twice
  over once `roles_from_catalog.yaml` gains `id` and `description`.

**The `{% elif r.primary %}` branch at `:49` goes.** `roles_from_catalog.yaml` produces no `primary`
field and nothing in the module or docs defines the concept — it is dead today, a purple pill for a
state that cannot occur. This design is the one respecifying the resolved-entry shape, so it is where
the branch is removed rather than carried forward as a third rendering nobody can trigger.

### `tile_attributes.yaml`

The ordinary chip's `<span>` gains `title="{{ r.description }}"`. Nunjucks renders a `null`
description as an empty attribute, which produces no tooltip — the same outcome as omitting it, so no
`{% if %}` is needed.

## What this needs from upstream

**A submitted role id the member already holds must not be rejected.** D2 rests entirely on this.
role-storage Decision 4 says both that the module "no longer risks an unrelated write failing" and
that "validating a submitted role against the catalog moves into the `UpdateMemberRoles` step". Those
conflict: a step that validates the whole submitted set against the catalog fails on an untouched
orphan, which is the behaviour Decision 4 says it retires, and this design would need its gate back.

Scoping the check to **newly-added** ids satisfies both readings. The step already fetches the member
row for its last-owner guard (`UpdateMemberRoles.js:44-52`, which role-storage retires), so it has
the current set in hand and the diff is free. Typos from any caller are still caught; held orphans
round-trip. Flagged upstream; either "newly-added only" or "no check at all" works here.

**The same question, on `InviteMember`.** The module has **two** role-write steps, and only one of them
has a "current set" to diff against. `InviteMember` has no member row — and the resend path submits
**stored** ids by definition (`resend-invitation.yaml` → `InviteMember(resend: true)`), so a pending
invitation whose role was later deleted from the catalog is the invitation-side orphan, and resending it
re-submits it.

Today that is accepted, but by accident of where validation lives rather than by decision:
`crud-invites.mjs:102-122` validates only `ctx.body.role`, which role-storage Decision 3 pins to `''`,
and `appRoles` rides as an unvalidated additionalField. **"No catalog check on `InviteMember`" is a
perfectly good answer — it just needs to be the recorded one**, in the same breath as the property
contract below. Otherwise a future upstream "validate roles in the invite step too" silently
reintroduces `ROLE_NOT_FOUND` on the Invitations tab, on a path with no picker to explain it.

**The step's property contract.** role-storage Decision 3 specifies an adapter-direct `update` of
`appRoles` but never names the step's authored property. Today `UpdateMemberRoles` takes
`role: <CSV string>` and `InviteMember` the same. This design assumes both become `roles: string[]` —
the name the module's payload already uses. It is the module's actual call signature, so it needs
pinning down rather than inferring.

**Ordering.** This design lands after role-storage. Nothing here is safe on CSV storage: an
`appRoles` read returns `[]`, and D2's premise — that submitting a held orphan saves — is exactly
what registration forbids today. Under today's code an orphaned `member` saves (BetterAuth unions its
built-in role names into `validStaticRoles` unconditionally) while an orphaned `old` fails with
`ROLE_NOT_FOUND`, inconsistently by role name.

## Files changed

| File                                                         | Change                                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/user-admin/requests/stages/members_base.yaml`       | drop `roles_arr`; header comment                                                                                                                |
| `modules/user-admin/requests/stages/invitations_base.yaml`   | drop `roles_arr` and `role_ids`; header comment                                                                                                 |
| `modules/user-admin/requests/stages/roles_from_catalog.yaml` | input `$appRoles`, drop the empty filter, add `id` + `description`; delete the stale gap NOTE                                                   |
| `modules/user-admin/requests/stages/members_filter.yaml`     | roles clause removed; drop the substring-hazard comment                                                                                         |
| `modules/user-admin/requests/get_all_members.yaml`           | prepend the roles `$match` at stage 0, before the `members_base.yaml` `_ref`                                                                    |
| `modules/user-admin/requests/stages/close_row.yaml`          | `$unset` `role`; note it as BetterAuth's tier                                                                                                   |
| `modules/user-admin/requests/get_user_detail.yaml`           | drop `role_ids`, add `orphan_ids`; header comment                                                                                               |
| `modules/user-admin/requests/get_users_excel_data.yaml`      | both `$reduce`s read `$appRoles`, drop the empty filters                                                                                        |
| `modules/user-admin/components/view/modal_access.yaml`       | seed from `appRoles`, orphan options, `filterString` + description, drop `required`, hint copy, fix the stale L1-5 comment                      |
| `modules/user-admin/components/view/tile_attributes.yaml`    | `title=` description tooltip on the ordinary chip                                                                                               |
| `modules/user-admin/components/invite_form.yaml`             | `filterString` + description, drop `required` (L50); delete the stale gap NOTE                                                                  |
| `modules/user-admin/components/all_members_filters.yaml`     | rich two-line options **+ `tag: { title: label }`**, `filterString` + description; delete the stale gap NOTE; fix the `roles_arr` comment (L50) |
| `modules/user-admin/components/all_invitations_table.yaml`   | resend reads `row.appRoles` (L136)                                                                                                              |
| `modules/user-admin/components/all_members_table.yaml`       | three stale split comments (L5, L41-44, L82); drop the dead `{% elif r.primary %}` branch (L49)                                                 |
| `modules/user-admin/api/update-access.yaml`                  | `roles` array property; header comment                                                                                                          |
| `modules/user-admin/api/invite.yaml`                         | `roles` array property (L133-136); header comment (L122-127)                                                                                    |
| `modules/user-admin/api/resend-invitation.yaml`              | `roles` array property (L17-22) — the module's third role-write path                                                                            |
| `modules/user-admin/api/check-invite-email.yaml`             | `find_invitation` projects `appRoles`, not `role` (L101); drop the dead `role: 1` from `find_member` (L68)                                      |
| `modules/user-admin/pages/invite.yaml`                       | pending-panel resend drops the `_js` CSV split, reads `resolved_invitation.appRoles` (L193-197)                                                 |
| `docs/user-admin/reference/row-contract.md`                  | `roles_arr` / `role_ids` / `role` rows out, `appRoles` in; `roles` gains `id` + `description`                                                   |
| `docs/user-admin/reference/indexes.md`                       | **new page** — the module-owned index, host-app-creates framing, physical field names (D7)                                                      |
| `docs/user-admin/index.md`                                   | the Roles section — a save carrying an orphan succeeds; link the new indexes page                                                               |
| `docs/llms.txt`                                              | regenerated via `pnpm docs:gen` after the new page (`docs:check` fails CI on drift)                                                             |
| `designs/user-admin-better-auth/design.md`                   | Decision 8 — retire the two impossible clauses, point at this design                                                                            |
| role-storage `design.md` (upstream) Decision 6               | record that the index is host-app-created, not provisioned in a module migration (D7)                                                           |
| `apps/demo/` (a consumer)                                    | any `table_columns` / `download_columns` binding `roles_arr` or `role_ids`                                                                      |

## Verification

`pnpm ldf:b` covers the config, and the built artifacts are worth inspecting rather than trusting —
that is how the stale gap notes were caught. Check `pages/user-admin/view.json` for the resolved
option labels and `pages/user-admin/all.json` for the filter's.

A silent-empty regression does not fail the build, so the read shapes need checking against real data
(`lowdefy_run_request`, or the auth-testing rig): `get_user_detail` returns a populated `appRoles` and
`roles`, `get_all_members` still shows role chips, and the export's roles column is not blank. Those
are precisely the sites where deleting `roles_arr` without repointing fails quietly.

`check-invite-email` is the fourth such site and the only one feeding a **write**: confirm
`resolved_invitation.appRoles` comes back populated, then **resend a pending invitation from both
callers — the invitations table and the invite page's pending panel — and read its `appRoles` back
unchanged**. A missing projection there reports success and blanks the invitation's roles.

`get_all_members` also needs its roles filter exercised with a filter set and unset: unset must leave
stage 0 as `$match: { organizationId }`, and set must return the same rows the post-`$lookup` filter
returned before the move. `explain` on the filtered read should show the compound index in use once it
exists.

The behavioural checks belong on the rig (`scripts/auth-testing/CHECKLIST.md`), since an orphan is a
data state. Against a member holding a role removed from the demo catalog:

- the tile shows a flagged `⚑ <id>` chip; an ordinary chip shows its description on hover;
- the picker shows `<id> (no longer configured)`, closable, with text;
- saving with it selected **succeeds**, and reading back shows the orphan still held;
- adding an unrelated role while it is selected saves both — no `null` reaches `appRoles`;
- removing it and saving succeeds, and it is then absent from the picker's options;
- attributes save in every one of the above, including with the orphan present;
- clearing every role saves and the member reads back with `appRoles: []`;
- typing a word from a role's description finds that role in the picker and in the roles filter;
- a fresh magic-link signup lands with no roles and no orphan chip.

## Non-goals

- **The eight dead `Validate` actions.** `params: <container id>` validates nothing, in
  `user-admin`'s `modal_access.yaml:25-27`, `modal_profile.yaml:25-26`, `modal_global.yaml:21-22` and
  `invite_form.yaml:146-147`, and `user-account`'s `modal_profile.yaml:31-32`,
  `modal_changepw.yaml:19-20`, `modal_disable2fa.yaml:22-23` and `modal_enroltotp.yaml:29-30` (the
  last already covered by `designs/users-fixes/2fa-enrolment-modal`). No field validation runs in any
  of them, including behind real `required` fields. The working form is
  `params: { blockIds: [...], regex: [...] }` — note **`blockIds`**, not the `blockId` the Validate
  docs document, which `getBlockMatcher` never reads and which silently matches nothing. Each form's
  rules start firing where they silently passed, which is correct but user-visible (D3).
  **All eight are owned by `designs/users-fixes/2fa-enrolment-modal` D6**, which carries the
  per-file namespace-regex mapping — not by a further follow-up design. That change also touches
  `modal_access.yaml` and `invite_form.yaml`, on different lines from this design's edits; **this
  design lands first** on those two files and the `Validate` swap applies on top.
- **Cleanup of orphaned ids across data — and any way to enumerate the members holding one.** Removing
  a role from config is deliberate and does not mutate stored data; the repair is a **data migration
  run by the app**, on the same footing as index creation (D7) — the module documents the contract, the
  app owns the data. So the module's orphan affordances are an anomaly indicator, not a cleanup tool
  (D2), and it deliberately offers **no way to list orphan-holders**: the roles filter's options are
  catalog ids only, so the one role you would want to filter on is the one you cannot select, and the
  answer is a visual scan of the Members list's flagged `⚑` chips. That is accepted at the module's
  stated sizing (low thousands of members, `user-admin-better-auth` design line 65), because the state
  is transient — it exists between a config change and the migration that follows it.

  The rejected alternative: concat a distinct-`appRoles`-minus-catalog read onto the filter's options,
  the way the picker concats `orphan_ids`. Cheap to build, but it is a new read and a new surface
  serving a state nobody enumerates by role — the migration does not consult the filter.

- **Repairing `required: true` for array-valued inputs generally.** A real engine wart: `required`
  compiles to a null check, so it is inert on every array input. This design only stops the module
  relying on it.
- **A migration mechanism.** D7. The one index this design needs is documented rather than
  provisioned.
- **Descriptions on the selected chip.** D4.
- **The `tenant` policy.** The module is pinned-only (role-catalog Decision 5). `member.role` is
  unset on the wire on that basis (D5); a tenant-capable module re-exposes it deliberately.
