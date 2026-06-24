# Title block: type label, status pill, and loading state

The shared page title bar (`modules/shared/layout/title-block.yaml`) currently shows a heading, an optional subtitle of change-stamp text, optional page actions, an optional back button, and a recently-added badge driven by a raw text+colour pair. Two things are inconsistent across the apps that use it: the entity type ("Company", "Contact", "User") is hand-concatenated into the title string in several different ways, and every caller re-derives the badge's label and colour from a status enum itself. This design extends the title block so the entity type and the status are first-class props the component renders consistently, and adds an opt-in loading state for the data-driven parts.

## Proposed change

1. Add a **`type`** prop — the entity type, rendered as a small uppercase "eyebrow" label directly above the title. The `title` prop becomes just the entity name; pages stop concatenating `"{label}: {name}"`.
2. Replace the raw **`badge_text` / `badge_color`** props with **`status` + `status_enum`** — the caller passes a status slug (runtime) and a status-enum map (build-time `_ref`); the title block resolves the label and colours internally and renders them as a status pill.
3. Render the status pill with the **standard status-enum colour contract** (`color` fill, `borderColor` border, `titleColor` text) as a chunky, vertically-centred pill to the left of the title — no longer a full-height square.
4. Add an opt-in **`loading`** prop (default `false`). When truthy, the title, subtitle, and status pill render as skeletons via Lowdefy's native `loading:`/`skeleton:` pair; the type eyebrow renders immediately because it is static config.
5. On **edit/create pages** the edit/create verb moves into the type eyebrow ("EDIT COMPANY" / "NEW COMPANY", or "INVITE USER" where the domain uses a different verb), so the eyebrow is the single consistent home for entity context.
6. **Migrate all callers** (workflow overview + group overview, contacts/activities/user-admin view/edit/new) and **document the title-bar prop interface** in the layout module README.

## Key decisions

**Status resolution moves into the component, not the caller.** Today `workflow-overview.yaml` carries two near-identical `_get` blocks pulling `.title` / `.titleColor` out of `workflow_lifecycle_stages`, and `workflow-group-overview.yaml` carries duplicated inline `_if` chains for label and colour. That resolution logic is copy-pasted per caller and drifts. Passing `status` (a slug) + `status_enum` (the map) and resolving inside the title block gives one resolution path. This is the "one correct way" principle: the component owns the mapping; callers supply data.

**Reuse the existing status-enum colour contract.** Both `modules/workflows/enums/workflow_lifecycle_stages.yaml` and `modules/shared/enums/action_statuses.yaml` already use the identical entry shape:

```yaml
<slug>:
  color: '#e6f7ff'        # light fill (pill background)
  borderColor: '#91d5ff'  # pill border
  titleColor: '#096dd9'   # pill text
  title: Action Required  # display label
  priority: 6             # optional, used elsewhere for sorting
```

The status pill consumes exactly these keys (`color`→background, `borderColor`→border, `titleColor`→text, `title`→label). No new contract is invented, and any existing status enum is usable as a `status_enum` as-is.

**Callers pass the override-merged `components/` map, not the raw `enums/` map.** For both workflow enums, `modules/workflows/components/<enum>.yaml` is a thin `_build.object.assign` of the base `enums/<enum>.yaml` and the per-app `*_display` override var (`module.lowdefy.yaml:78,89`) — UI-only colour/label overrides a consuming app may set. The current badge code already resolves against `components/`. Migrated callers must keep pointing `status_enum` at `components/<enum>.yaml`; pointing at the raw `enums/` map would silently drop any app's `*_display` overrides back to the base palette. (The brand-new action-group enum below is the exception — it has no override var yet, so it is referenced directly.)

**Replace the badge entirely rather than keeping a raw escape hatch.** All three current badge callers map cleanly to an enum, so `badge_text`/`badge_color` are removed, not kept alongside `status`. The group-overview's done/in-progress/blocked badge — currently inline `_if` chains — is enum-shaped, so it gets a small status enum (see Migration). Keeping a raw badge "just in case" would be speculative surface; it can be re-introduced if a concrete non-enum case ever appears.

**The verb lives in the eyebrow on edit/new pages.** Rather than "Edit {label}: {name}" in the title, the eyebrow shows "EDIT COMPANY" / "NEW COMPANY" and the title holds just the entity name (or is empty on a new record). The eyebrow stays the consistent place a reader looks for "what kind of thing is this", regardless of view/edit/new.

**Loading is opt-in and defaults off.** The skeleton guidance is explicit that *static* page titles (a list page's "Contacts" heading) should not skeleton. Entity view/detail pages are the opposite case — title and status are data-driven. A `loading` var defaulting to `false` keeps static titles untouched while letting data pages pass `loading: { _not: { _request: get_contact } }`. The type eyebrow is never skeletoned because it comes from static module config, not the request.

## Current state

- `modules/shared/layout/title-block.yaml` is the default title bar, composed by `modules/layout/components/page.yaml` (the `page` component). It is also overridable wholesale per-page or per-module via the `title_block` var.
- It accepts these per-page `_ref` vars, threaded through `page.yaml`: `title`, `doc`, `page_actions`, `show_back_button`, `back_link`, `badge_text`, `badge_color`. None of these are documented in the manifest or README — only inline comments.
- `badge_text` / `badge_color` were added in commit `0567dc8` (#48). The badge renders as a `Tag` styled as a full-height pill to the left of the title, taking a single colour.

**Badge callers re-deriving label + colour:**

- `modules/workflows/pages/workflow-overview.yaml` — `badge_text` and `badge_color` each `_get` from `workflow_lifecycle_stages.yaml`, keyed by `workflow.status.0.stage`, reading `.title` and `.titleColor`.
- `modules/workflows/pages/workflow-group-overview.yaml` — `badge_text` and `badge_color` are duplicated inline `_if` chains over `group.status` (done / in-progress / blocked).

**Entity type baked into title strings (the inconsistency):**

- `modules/contacts/pages/view.yaml` — nunjucks `{{ label }}{% if profile %}: {{ profile.title }}{{ '.' if profile.title }} {{ profile.name }}{% endif %}`.
- `modules/activities/pages/view.yaml` — nunjucks `{{ label }}{% if title %}: {{ title | safe }}{% endif %}` (a fourth variant).
- `modules/contacts/pages/edit.yaml`, `modules/activities/pages/edit.yaml` — `_string.concat: ["Edit ", {_module.var: label}, ": ", name]`.
- `modules/user-admin/pages/{view,edit,new}.yaml` — nunjucks `{% if app_title %}{{ app_title }} {% endif %}User…`, with the verb (`Edit`/`Invite`) baked in on edit/new.

In every case `label` (or `app_title`) is already a module var — the entity type is configurable, just smushed into the heading three different ways.

## Proposed prop interface

The title bar gains three new props and drops two:

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `type` | string | `null` | Entity-type eyebrow label above the title (e.g. `Company`, `Edit Company`). Hidden when `null`. Rendered uppercased by the component — callers pass normal case. |
| `status` | string | `null` | Current status slug (runtime). Looked up in `status_enum`. Hidden when `null` or unmatched. |
| `status_enum` | object | `null` | Status-enum map (build-time `_ref`) with the standard `{ color, borderColor, titleColor, title }` entry shape. |
| `loading` | boolean | `false` | When truthy, title/subtitle/status render as skeletons. Gate on `_not: _request: <id>`. |
| ~~`badge_text`~~ | — | — | **Removed** — replaced by `status` + `status_enum`. |
| ~~`badge_color`~~ | — | — | **Removed**. |

Existing props (`title`, `doc`, `page_actions`, `show_back_button`, `back_link`) are unchanged.

`type` and `title` are arbitrary string-valued expressions — the component owns only the *structure* (eyebrow placement, uppercasing, the pill), never the string content. Each page builds its own `type`/`title`; the component stays generic. To keep the eyebrows consistent across modules, callers follow these conventions:

- **`title`** holds just the entity name/identifier — never a `"{type}: {name}"` concatenation.
- **`type`** holds the entity type, optionally prefixed by a verb:
  - **View** → the entity type alone (e.g. `Company`, `User`).
  - **Edit** → `Edit {type}` (e.g. `Edit Company`).
  - **Create** → the create verb + type — usually `New {type}`, but follow the domain's own verb where it differs (user-admin uses `Invite {…} User`).
- `type` is passed in **normal case**; the component uppercases it.

The "type" string is inherently caller-specific (it may fold in a `label` var, an `app_title` prefix, or a literal word), so these are documented conventions rather than something the component enforces mechanically.

### Worked examples

**Status-driven page (workflow overview):**

```yaml
title:
  _state: workflow.title
type: Workflow                       # eyebrow
status:
  _state: workflow.status.0.stage    # slug, runtime
status_enum:
  _ref: components/workflow_lifecycle_stages.yaml   # override-merged map, build-time
loading:
  _not:
    _request: get_workflow_overview
```

The two `_get` blocks that previously sat in the page disappear — the title block does the lookup.

**Entity view page (contacts):**

```yaml
type:
  _module.var: label            # "Company"
title:
  _nunjucks:                    # just the entity name now
    template: "{% if profile %}{{ profile.title }}{{ '.' if profile.title }} {{ profile.name | safe }}{% endif %}"
    on:
      _request: get_contact.0
loading:
  _not:
    _request: get_contact
```

**Edit page (verb in the eyebrow):**

```yaml
type:
  _string.concat: ["Edit ", { _module.var: label }]   # "Edit Company"
title:
  _request: get_contact.0.profile.name                # name only; no "Edit … :" prefix
```

**New page:**

```yaml
type:
  _string.concat: ["New ", { _module.var: label }]     # "New Company"
# title omitted / empty — eyebrow carries the context
```

**user-admin (no `label` var; literal `User` type; "Invite" verb):** user-admin has no per-entity `label` — the type is the literal word `User`, optionally prefixed by the `app_title` module var, and its create verb is "Invite" (not "New"). The eyebrow is built with nunjucks per page:

```yaml
# view  → "ACME USER" (or "USER" when app_title is unset)
type:
  _nunjucks:
    template: "{% if app_title %}{{ app_title }} {% endif %}User"
    on:
      app_title: { _module.var: app_title }
# edit  → template: "Edit {% if app_title %}{{ app_title }} {% endif %}User"
# new   → template: "Invite {% if app_title %}{{ app_title }} {% endif %}User"
```

The `title` on each page drops the `{…} User: ` prefix and keeps only the name (preserving the honorific period, e.g. `{{ profile.title }}{{ '.' if profile.title }} {{ profile.name }}`).

## Visual spec

Rendered for reference in `mockups/mockup.html` (the spec below is the source of truth; the mockup mirrors it):

- **Type eyebrow** — uppercase, `letter-spacing` ~0.08em, ~11px, secondary text colour, sits directly above the title with a small gap.
- **Title** — unchanged `h2` (24px, 600).
- **Subtitle** — unchanged change-stamp line (secondary, ~13px).
- **Status pill** — chunky and vertically centred (not full-height). Roughly `padding: 15px 14px`, `border-radius: 6px`, `font-size: 15px`, `font-weight: 500`, single-line. Fill = enum `color`, border = enum `borderColor`, text = enum `titleColor`. Sits to the left of the title block; hidden when no status.
- **Loading state** — status pill, title, and subtitle render as shimmer skeletons sized to their real footprint (pill ~96×50, title bar ~26px tall, subtitle bar ~13px tall). The eyebrow renders immediately.

## Implementation shape

In `title-block.yaml`:

- **Type eyebrow** — its **own** block above the title/subtitle block (not folded into it), gated `_build`/runtime on `type != null`, with `text-transform: uppercase` styling. It must be separate: Lowdefy's loading mechanism swaps the *entire* block to its skeleton tree when `loading` is true (`CategorySwitch.js:34`), so an eyebrow nested inside the title block would vanish whenever `loading` is set — breaking the "eyebrow renders immediately, never skeletoned" guarantee. Keeping it a sibling block with no `loading`/`skeleton` of its own is the only structure where that guarantee holds.
- **Status pill** — replaces the current `title-badge` `Tag`. Built only when `status_enum`/`status` is wired. Resolves the entry via `_get` from `status_enum` keyed by the `status` slug; reads `.title` for the label and `.color` / `.borderColor` / `.titleColor` into the pill style. `visible` gated on the resolved status being non-null. The three-colour contract (independent fill/border/text) **cannot** ride antd `Tag`'s single-value `color` prop — use a `Box`/`Html` with explicit `backgroundColor` / `borderColor` / `color` style bindings instead. (Likewise, don't use `Tag` inside the `skeleton:` tree — see Loading.)
- **Loading** — the title/subtitle container and the status pill each carry `loading: { _var: loading }` + a `skeleton:` block tree (a `Skeleton` sized to the title and a thinner one for the subtitle; a `Skeleton` pill for the status). The status skeleton only appears when status is wired, so pages without a status don't flash a placeholder pill.

`page.yaml` passes the new vars through to the `_ref` and stops passing `badge_text`/`badge_color`.

## Files changed

**Component:**

- `modules/shared/layout/title-block.yaml` — add type eyebrow + status pill (replacing the badge) + loading/skeleton.
- `modules/layout/components/page.yaml` — thread `type`, `status`, `status_enum`, `loading` into the title-block `_ref`; remove `badge_text`/`badge_color`.

**Callers to migrate:**

- `modules/workflows/pages/workflow-overview.yaml` — badge → `status`/`status_enum`; add `type` + `loading`.
- `modules/workflows/pages/workflow-group-overview.yaml` — badge → `status`/`status_enum` (needs a group-status enum, below); add `type` + `loading`.
- `modules/contacts/pages/{view,edit,new}.yaml` — split type out of title; add `loading` on view.
- `modules/activities/pages/{view,edit,new}.yaml` — same.
- `modules/user-admin/pages/{view,edit,new}.yaml` — same (`app_title`/`User` prefix → eyebrow).

**New enum:**

- A status enum for the group overview's done / in-progress / blocked states — the **action group's rollup status** (the aggregate state across the actions in the group), distinct from `action_statuses.yaml` which is an individual action's status. Named `modules/workflows/enums/action_group_statuses.yaml` to match the module's `action_groups` vocabulary and avoid blurring with per-action status. A small dedicated enum (preserves the current done=green, in-progress=blue, blocked=grey colours) rather than reusing `action_statuses.yaml` (same slugs but in-progress is teal, not blue). Referenced directly as a plain `enums/` map — it has no `*_display` override var, so no `components/` wrapper is created until a concrete per-app override need appears.

**Docs:**

- `modules/layout/README.md` — document the title-bar prop interface (currently undocumented): `title`, `type`, `status`, `status_enum`, `doc`, `loading`, `page_actions`, `show_back_button`, `back_link`. Note the standard status-enum contract and link to the enums idiom.
- `.changeset/` — changeset covering the layout component change + caller migrations + the removed badge props.

## Migration / compatibility

`badge_text` / `badge_color` are removed, not deprecated. All callers in this repo are migrated in the same change. Any external/consumer override that passes `badge_*` would silently lose its badge — called out in the changeset as a breaking change to the title-bar interface. The wholesale `title_block` override path is unaffected (it replaces the block entirely and never used these props).

## Non-goals

- No change to the back-button or `page_actions` behaviour.
- No change to the change-stamp subtitle content (only its loading state).
- Not introducing status enums for entities that don't already have one — `status`/`status_enum` is optional and only the current badge callers are wired.
- Not touching list/index page titles — they remain static, no eyebrow, no skeleton, unless a page opts in.

## Open questions

- ~~**Group-status enum**: dedicated vs reuse `action_statuses.yaml`.~~ **Resolved:** dedicated `modules/workflows/enums/action_group_statuses.yaml` (keeps the existing blue "in-progress"), referenced directly with no `components/` override wrapper. See "New enum" above.
- ~~**Eyebrow placement in markup**: separate block vs leading element inside the title `Html` template.~~ **Resolved:** the eyebrow is its own sibling block above the title/subtitle block, with no `loading`/`skeleton` of its own — required for the "never skeletoned" guarantee (see Implementation shape).
