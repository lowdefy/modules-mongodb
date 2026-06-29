# Part 56 — Three-tier action pages (entity workspace)

**Source rationale:** a production app extended the module's action-surface pages into a three-column "entity workspace" (left = the entity's workflows/actions, middle = the action being worked, right = entity detail + history in tabs). This part generalises that layout into the module so every action page ships it. **Layer:** UI delivery (resolver templates + a shared layout component) plus one contained engine-link change. **Size:** M. **Repo:** `modules/workflows/templates/`, `modules/workflows/components/`, `modules/workflows/resolvers/makeActionPages.js`, `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js`.

Today an action page is a single centred column (`content_width: 750`): the form body + a read-only universal-fields sidebar, or — for check actions — the shared `check-action-surface`. To see the entity's other actions, its details, or its history, the user leaves the page. This part wraps every action surface in a **shared** three-tier shell so that context sits alongside the action being worked.

**No-jarring-shift is the binding constraint.** The left panel (`actions-on-entity`) lets the user jump between a workflow's actions — form _and_ check — without leaving the workspace. So the column scaffold must be identical across page kinds: same left, same right, and only the **middle's content** swaps. Everything below follows from that. The shell is one component every action page `_ref`s; what differs per kind is the block arrays passed into its slots, never the layout.

## Proposed change

1. **A shared three-tier shell component** (`components/action-workspace.yaml`) — the page layout, identical for form and check. Left = `actions-on-entity` (the entity's workflows + steps). Middle = a caller-supplied surface. Right = a `universal-fields` card (Part 24) above `workflows-events-timeline` (History), with an optional `Tabs` wrapper so the slot can sit beside History as a **Details** tab on form pages. The shell exposes three caller slots — `middle`, `universal_fields` (RHS top), `details_slot` (RHS Details tab) — plus baked entity context (`entity_collection`, `reference_field`) and the normalized `entity_id` read it gates on. One shell, every action page `_ref`s it.
2. **Universal fields render in the RHS for both kinds (Part 24 reconciliation).** Part 24 already renders the universal-fields card as a RHS sidebar on form pages; check rendered it as middle _primary_ content. The shell unifies the placement — universal fields are the RHS-top card on **both** kinds — so the metadata surface never jumps when navigating form↔check. Each template/page composes the `universal-fields` component with its own kind-specific vars (form: `state_path: fields`, `action.*`; check: `state_path: current_action.fields`, `current_action.*`) and hands the result to the shell's `universal_fields` slot. The shell stays layout-only.
3. **Form templates adopt the shell.** Middle = the existing form body (form card). `universal_fields` = the Part 24 card. `details_slot` = `entity_view.slot` → renders as the RHS **Details** tab (the original plan: Details + History tabs). Page widens from `content_width: 750` to full width. **The form pages' existing bottom Activity card is removed**, replaced by the shell's entity-scoped History tab — an intentional broadening (action-scoped → entity-wide), not a drop: every engine event is written with **both** `references.action_ids` and `references.[entity_ref_key]`, with the inline comment folded into the same doc (`planEventDispatch.js`), so the entity-scoped History is a strict **superset** of the old action Activity. The cost is that on a busy entity a single action's activity is diluted among the entity's whole history — accepted, since seeing the action in its entity context is the point of the workspace.
4. **Check actions get a per-workflow page, authored independently of the modal.** `makeActionPages` emits, per workflow with ≥1 `check` action, a **single** `{workflow_type}-check` page (mode derived as `check-action-modal` does — D3). The workspace check page is its **own composition** (D6), not a reuse of `check-action-surface`: it places `entity_view.slot` (the review subject) + the comment input + the signal buttons **in the middle**, with the universal-fields card in the RHS and History below it. No Details tab on check: the slot is the middle content, so the right column is universal-fields + History only. `computeEngineLinks` points the check branch at `{workflow_type}-check`; the shared `workflow-action-*` pages are retired. The in-context `check-action-modal` is a **separate component**, untouched.
5. **`entity_view` on the workflow config** (raw YAML, read-only, `_ref`-able): `{ slot }` — the Details/review block array. `makeActionPages` reads it from the raw workflow and bakes the slot into the emitted pages via build-time `_var` (the mechanism the templates already use for `formHeader`/`formFooter`). `makeWorkflowsConfig` excludes it from the materialised engine config — build-time UI only, never reaches engine logic. **History sources its match field from the workflow's `entity.ref_key`** (the event-references key the engine already writes onto every event doc — `planEventDispatch.js:157`, required by `schema.js:91`, lifted from `entity.ref_key` to the flat `entity_ref_key` by Part 57's resolver), not from `entity_view`; the shell bakes `reference_field` from `workflow.entity.ref_key` the same way it bakes `entity_collection` from `workflow.entity.collection` — both read from the raw workflow's nested `entity:` block (Part 57).
6. **`entity_view` is read-only.** The slot renders display blocks only — no inputs, save handlers, or state writes. (The motivating screenshot is a disabled copy of an edit component; read-only is the committed restriction.)
7. **A page header — built from the layout module's existing chrome.** The breadcrumb, eyebrow, title, and status pill are **not** new components — they're vars the layout `page` component already renders (via `modules/shared/layout/title-block.yaml`). Each action page passes `breadcrumbs` (`Home / {entity type · name} / {workflow title} / {action title}`, the standard `- home: true` convention every module page uses), `type` (the workflow-title eyebrow), the already-wired `title` (the baked action title) / `status` / `status_enum`, and the action's `message` as a subtitle (via one new optional `description` var on the shared `title-block`). The title bar renders **full content-width above the three columns** (D8); the breadcrumb is page chrome above it. The only shared new artefacts are a small `breadcrumbs` config fragment so the four-segment trail isn't duplicated across templates, plus the one additive `description` var on `title-block`. Two cheap data changes feed the deep-links: `workflow_id` is added to the `GetWorkflowAction` envelope (for the Workflow→overview link, D9), and `entity_link.name` is resolved from an optional `name_field` on the workflow's `entity:` block (the entity instance name, D10 — see the Part 57 dependency).

## Key decisions

### D1 — `entity_view` lives on the workflow config, not the `entities` var

The entity-routing config (`page_id`, `id_query_key`, `title`) — the connection `entities` map today, fields on the per-workflow `entity:` block once Part 57 lands — is a thin scalar lookup the module uses to deep-link back into host entity pages. A full view-component block tree has no place there. The natural, author-intuitive home is the workflow that owns the page. **Per-workflow, not per-entity:** one entity can host several workflows, and a workflow may want a different entity view than its siblings; identical views share via a single `_ref`. This also pairs cleanly with D3 (per-workflow check page) — both the form pages and the check page of a workflow bake that workflow's one `entity_view`.

### D2 — The slot is baked at build time, because Lowdefy can't inject block trees at runtime

A Lowdefy block tree is static YAML resolved by the build walker; there is no way to render an arbitrary, app-authored block subtree from runtime state. So the entity view **must** be baked into a page that knows the entity at build time. The resolver has `workflow.entity.collection` and (now) `workflow.entity_view` in hand (both read from the raw workflow's nested `entity:` block — Part 57) and injects them via `_var` — the same path `page_config.formHeader`/`formFooter` already take (`templates/view.yaml.njk:121-136`). This is also why a _declarative_ entity-detail spec (a field list the module renders generically) was not pursued: the screenshot's detail panel is a real, if read-only, component, and a spec language would re-invent forms for no gain.

### D3 — Per-workflow check page, single page, mode-derived (Option A, variant i)

Check actions use one shared page set (`pages/workflow-action-{view,edit,review}.yaml`) serving every workflow, so there is nowhere to bake a per-entity slot. Option A emits a workflow-specific check page instead. Of the two variants:

- **(i) chosen** — a single `{workflow_type}-check` page that derives `current_action.mode` from the loaded action (the exact derivation `check-action-modal.yaml` already proves: stage `error` → view, `in-review` + `allowed.review` → review, the editable stages + `allowed.edit` → edit, else view). One page per workflow, fewest pages, matches "a workflow-specific actions page".
- (ii) rejected — three verb pages `{workflow_type}-check-{view,edit,review}` for strict parity with the retired shared pages. More pages, and the per-verb distinction is redundant once the page derives mode.

`computeEngineLinks` keeps its per-verb `links` cells (the display layer still uses them for `visible_verbs`), but every non-null check cell now points at the same `{workflow_type}-check` page; the page reads `?action_id` and derives mode. This **collapses the existing `error`-verb special case** (`computeEngineLinks.js:116-121` currently maps the check `error` verb to `workflow-action-view`): the per-workflow page derives `view` mode at stage `error` anyway, so all non-null check cells — `error` included — target `{workflow_type}-check`. The check change is confined to `computeEngineLinks.js:116-121`; `computeEngineLinks.test.js:66-79`'s error-verb test is **rewritten** (not merely edited) to assert the new target.

**Mode derivation is new page code, copied from the modal — not the retired pages.** The old shared pages wrote a _literal_ mode per verb. The per-workflow check page must instead replicate `check-action-modal.yaml`'s load-bearing pattern (`:50-64,98-146`): derive mode from the `GetWorkflowAction` **response** (`_request: …`, not `_state: current_action.*`), inside the **same** `SetState` that spreads the response. Params evaluate against pre-`SetState` state, so a `_state`-based derive reads an empty `current_action.status`; splitting the writes prunes `current_action.status` before mode is set. One response-derived `SetState`, as the modal proves.

### D4 — Navigation reuses the existing no-modal degrade path

`actions-on-entity` bakes in `check-action-click` (`components/check-action-click.yaml`), which **navigates to the action's page when no `check_action_modal` is on the page** (Part 55 D2/D3, the `catch` arm). The workspace pages deliberately drop no modal, so a click on any row — check included — navigates via the server-resolved `action.link`. No new flag, no new handler: the user's "link to the action page even for check" falls out of the shipped degrade behaviour.

### D5 — Option B recorded as considered-and-rejected

Option B kept the shared check pages simple (left + middle + History, no custom Details; check stays modal-first on the entity page). It needed near-zero work and no engine change, but left check pages permanently second-class — no entity context where a deep-linked check action lands. With the check-link change contained to one file and the shell shared, A's extra cost is small and the result is uniform. B is documented here rather than built.

### D6 — Modal and workspace check page are two separate components

`check-action-surface.yaml` is "one body, two containers" today (the modal + the retired shared pages). The workspace check page can't reuse that body: a full page spreads the surface across three columns, a modal stacks it in one card. The two have **diverged too far for shared components to pay off** — so they are two **entirely separate components**, not one parameterised surface:

- **The in-context modal keeps its all-in-one body** — universal fields, comment, status, and buttons stacked in one card (`check-action-surface.yaml`). **Untouched**; it remains the entity-page shortcut.
- **The workspace check page is its own composition** — `entity_view.slot` + comment + signal buttons in the **middle**, universal fields in the **RHS** (D2), History below. It is authored standalone (Task 8), not by `_ref`-ing leaves out of the modal's surface.

An earlier draft proposed **splitting the surface into shared leaf components** that both compositions `_ref`, so "behaviour can't drift." That was rejected: the extraction machinery (a leaf subdirectory, explicit var contracts per leaf, a hand-off into the page template) costs more than it saves once the two arrangements have so little in common, and it dragged in an extra refactor task (the now-deleted "split the surface" task) for no real reuse. The check page instead **duplicates** the handful of controls it needs (signal-button bar, comment input, status-history, and — per D3 — the modal's mode-derivation ladder, copied not shared); the small duplication is cheaper and clearer than the shared-leaf scaffolding. Genuinely independent shipped components are still reused as components (Part 24's `universal-fields`, composed by each surface with its own vars — that is not the rejected extraction). This also keeps the modal genuinely unchanged (a non-goal): the page never touches it.

### D7 — Details slot: RHS Details tab on form, middle on check

For a **form** action the work is filling the form, so the entity detail is reference material — it sits in the RHS as a **Details** tab beside History (the original three-tier plan). For a **check** action the work _is_ reviewing the entity, so the entity detail is promoted to the **middle**, beside the decision controls, where it fills the column that would otherwise be near-empty once universal fields move to the RHS (D2). Same `entity_view.slot` block array, rendered in the position that matches the action's nature.

Consequence on the scaffold: the RHS Details _tab_ is form-only (on check, the slot is in the middle, so the check RHS is universal-fields + History with no Details tab). This is the one place the columns differ by kind — accepted deliberately: the heavy scaffold (left steps; RHS universal-fields + History) stays put across form↔check, and the Details panel moving to centre-stage on a check reads as intentional (you're now reviewing it), not as a layout glitch. The alternative — Details always a RHS tab, check middle = decision-only — was rejected as leaving the check middle too thin.

### D8 — The header is the layout module's native chrome, rendered full content-width

The breadcrumb, eyebrow, title, and status pill are **already** provided by the layout `page` component. `modules/shared/layout/title-block.yaml` renders an optional back button, a status pill (from `status` + `status_enum`, the three-colour contract), a `type` eyebrow (an uppercased label above the title), the title (+ a subtitle line — today the change-stamp from `doc`), and right-aligned `page_actions`; the breadcrumb comes from the page's `breadcrumbs` var. The action templates **already wire** `title` / `status` / `status_enum`. So on the page vars this part adds only `breadcrumbs` and `type` (= the workflow title) — no new title or breadcrumb block components. The one component change is small and additive: **`title-block` gains an optional `description` var** that renders in the subtitle slot (used for the action's `message`, see the "Title content" note below), shown in place of the change-stamp line when set. The header stays the same shared component every module page uses — extended by one optional var, not forked.

**Full content-width, not above-center.** The title bar is the first block in the page's content area, so it spans the full content width above the three columns. An earlier draft put the title above the center column only, reasoning that form↔check navigation shouldn't shift a full-width element. That reasoning doesn't hold: per **D4, jumping between actions in the left panel is a full page load** (the row links to the action's page), not an in-place swap — so nothing "shifts", and a title bar in the same position on every action page reads as continuity, exactly like the shared left/right columns. Full-width also keeps the action pages consistent with the rest of the app's pages and gives the back button + `page_actions` their conventional home.

**Implementation note — center-only fallback.** If, against real content, the full-width title bar feels heavy above the three-column workspace, the fallback is: set `hide_title: true` on the page and `_ref` the same shared `modules/shared/layout/title-block.yaml` config into the **center column** instead (reusing the component, not rebuilding it). Try this only if the full-width bar is unsatisfactory.

**Title content is eyebrow + title + subtitle + status.** The eyebrow (`type` var) is the workflow title (baked at build time); the title is the **baked action title** (`page_config.title` — `action.title ?? humanizeSlug(action.type)`, the value the templates already wire, and what the ASCII mockups show); the subtitle (the new `description` var) is the action's **`message`** — the human-readable action label that also renders in the action steps and the events timeline (`action[app_name].message`, set by each template from its own state path, like `title`/`status`); the status pill maps `status[0].stage` through the `action_statuses` enum (the same lookup `check-action-surface` already uses). Due date and assignees are deliberately **not** in the header — they live on the universal-fields card / action body; the header stays a compact identity strip. (If the `message` subtitle reads poorly against real content, a fallback — e.g. assignees — is an open question, decided at the screen, not spec'd here.) The breadcrumb segments are assembled by a small shared `breadcrumbs` config fragment (D9/D10) so the four-segment trail isn't duplicated across the templates. The in-context modal is **not** a layout page and keeps its own inline title (unchanged).

### D9 — Workflow breadcrumb segment: title baked at build time, link via a new envelope `workflow_id`

The Workflow breadcrumb segment links to the existing `workflow-overview` page (`pages/workflow-overview.yaml`, addressed by `?workflow_id=`). Lowdefy breadcrumb items spread their whole object onto the `Link` component (`Breadcrumb.js:50`), so a breadcrumb item supports `label` + `pageId` + `urlQuery` directly. Two values feed it:

- **Label** — the workflow title, **baked at build time**. `makeActionPages` resolves `workflow.title ?? humanizeSlug(workflow.type)` (it already does this for action page titles); it passes the workflow title to the templates as the breadcrumb fragment's `workflow_title` var (also the `type` eyebrow). No runtime fetch — the page belongs to exactly one workflow.
- **Link target** — `{ pageId: <scoped workflow-overview>, urlQuery: { workflow_id } }`. The pageId bakes via `_module.pageId: workflow-overview`; `workflow_id` is read at runtime — but it is **not in the `GetWorkflowAction` envelope today** (the allowlist at `GetWorkflowAction.js:233-260` omits it, though `action.workflow_id` exists on the doc and drives the workflow lookup at `:162`). So this part **adds `workflow_id` to the envelope** — a one-line allowlist addition. Each template passes its own `_state.{action|current_action}.workflow_id` into the breadcrumb fragment.

### D10 — Entity breadcrumb segment: type always, instance name via optional `entity.name_field`

`entity_link` (built in `GetWorkflowAction.js:217-227`) carries `{ pageId, urlQuery, title }`, where `title` is the entity **type** label ("Company", "Lead") and a working deep-link. The specific instance **name** ("Acme Corp") is **not** on the response, and nothing tells the module where to read it. So:

- The breadcrumb entity segment **always** renders the type label as a link (free, works today).
- The instance name is **opt-in**: a new optional `name_field` (a dot-path into the entity doc) on the workflow's `entity:` block — the per-workflow block Part 57 introduces (`entity: { collection, ref_key, page_id, id_query_key, title }`), which replaces the connection-level `entities` map and the flat `entity_collection`/`entity_ref_key`. `name_field` is one more optional field on that same block. When set, `GetWorkflowAction` does one lightweight projected read (the file's `findDocs` helper with `limit: 1`, `[doc] =` destructure, as its other reads do) on `entity_collection` by `entity_id` projecting that field, and attaches it as `entity_link.name`; the segment renders "{type} · {name}". When unset, `entity_link.name` is null and the segment shows the type only — no extra query.

**No connection-schema change.** Because `name_field` lives on the workflow's `entity:` block (not the connection `entities` map Part 57 removes), it rides through to the connection inside `workflowsConfig`, whose workflow and action levels are `additionalProperties: true` (`schema.js:87,100`) — so no strict-schema entry is needed. Part 57's resolver lifts `entity.collection`/`entity.ref_key` to the flat names and carries the _remainder_ of the `entity:` block (the routing fields) into the materialized `entity` object; `name_field` rides that remainder, so **`makeWorkflowsConfig` must preserve it** (carry the routing remainder wholesale rather than whitelisting only `page_id`/`id_query_key`/`title`). `GetWorkflowAction` then reads it from the already-resolved `wfConfig.entity.name_field`. Validation is optional, at the `makeWorkflowsConfig` layer alongside Part 57's `entity`-block validation — never a third connection-schema layer. (Contrast `entity_view`, also UI-only and build-time-baked, which never reaches the connection at all.)

This keeps the common case zero-cost and avoids inventing a generic name-extraction heuristic: the host app declares the name field, the module reads exactly that. The read-only `entity_view` slot's own fetch is **not** the name source — the breadcrumb must work whether or not a workflow declares `entity_view`, so the name resolution is independent and lives in the envelope. (A shared `buildEntityLink` helper across the three envelope builders is a reasonable later cleanup; this part adds name resolution only where the header needs it.)

## The three-tier shell

Same scaffold both kinds; only the middle content and whether the RHS has a Details tab differ.

```
FORM page
┌───────────────────────────────────────────────────────────────────────┐
│ Home / Company · Acme Corp / Onboarding / Collect Documents             │ ← breadcrumb (page chrome)
│ ONBOARDING                                          [ In Progress ]      │ ← eyebrow (type) + status pill
│ Collect Documents                                                       │ ← title (full content-width)
├────────────────┬─────────────────────────┬──────────────────────────┤
│ actions-on-    │  form body + submit     │  universal-fields card   │
│ entity         │  buttons                │  Tabs[ Details | History ]│
│ (current row   │                         │   • Details = slot       │
│  highlighted)  │                         │   • History = timeline   │
└────────────────┴─────────────────────────┴──────────────────────────┘

CHECK page
┌───────────────────────────────────────────────────────────────────────┐
│ Home / Company · Acme Corp / Onboarding / RCA Acceptance               │ ← breadcrumb (page chrome)
│ ONBOARDING                                          [ In Review ]        │ ← eyebrow (type) + status pill
│ RCA Acceptance                                                          │ ← title (full content-width)
├────────────────┬─────────────────────────┬──────────────────────────┤
│ actions-on-    │  entity_view.slot +     │  universal-fields card   │
│ entity         │  comment + signal       │  History (timeline)      │
│ (current row   │  buttons                │   (no Details tab — slot │
│  highlighted)  │                         │    is in the middle)     │
└────────────────┴─────────────────────────┴──────────────────────────┘
   breadcrumb + title bar are the layout page's native chrome, full content-width
   above the columns (D8). columns stack to full width on small breakpoints (sm: span 24).
```

**Shell vars** (`components/action-workspace.yaml`, plain `.yaml`, all inputs in operator/block-array positions). The shell is layout-only — it renders whatever block arrays the caller passes into its slots:

- `middle` — block array, the action surface (required).
- `universal_fields` — block array, the Part 24 universal-fields card composed by the caller with its own kind-specific vars (RHS top, both kinds).
- `details_slot` — block array, baked from `entity_view.slot`. On form pages it renders as the RHS **Details** tab (omitted when empty, leaving History as the sole tab); check pages pass it empty here because the slot is in their `middle`. **When History is the only tab, the `Tabs` wrapper stays** (rather than rendering the timeline bare): the single tab doubles as a "History" section heading, and keeping the same `Tabs` structure whether or not Details is present holds the RHS layout stable — no shift when navigating form↔check or when a workflow has no `entity_view`.
- `entity_collection` — scalar, baked from `workflow.entity.collection` (for `actions-on-entity`; `makeActionPages` reads the raw nested `entity:` block — Part 57).
- `reference_field` — scalar, baked from `workflow.entity.ref_key` (for the History timeline). Required entity-block field, so always available — which is why History is unconditionally present.

The shell is the three columns only. The header (breadcrumb + eyebrow + title + status) is the layout `page` component's native chrome (D8), set by the template via the page's `breadcrumbs` / `type` / `title` / `status` vars — not by the shell. The breadcrumb's Home segment is the standard `- home: true` item; the Entity segment links via the action's `entity_link` (type + optional `.name`, D10); the Workflow segment links to `workflow-overview?workflow_id=…` (D9); the Action segment is the current page (no link).

**State contract — one normalized read.** The loaded action lives under different keys per kind (`_state.action` on form pages; `_state.current_action` on the check page / surface), so the shell cannot read a fixed action path. The shell needs only one runtime value: the entity id (left panel, History `reference_value`, and the mount gate). So **every action page sets a normalized scalar `_state.entity_id`** from its own loaded response, in the onMount/`SetState` it already runs (form templates beside `set_action`; the check page in the same response-derived `SetState` that derives mode — D3). The shell then reads a single fixed `_state: entity_id` everywhere. This is a single normalized "the entity this page is about" scalar — not a duplicated action object — and it leaves the check surface and the in-context modal (which keep `current_action`) untouched. The read-only `details_slot` likewise reads `_state: entity_id` for its own entity fetch (`entity_collection` is build-time-baked, no state needed).

The header (D8) reads several action fields (`message`, `status[0].stage`, `workflow_id`, `entity_link`) for the title bar and breadcrumb, but it is set by the **template** on the layout `page` vars using the template's own state path (`_state.action.*` on form templates, `_state.current_action.*` on the check page) — exactly as the templates already wire `title` / `status` today. So the header needs no normalized scalar; the single `entity_id` scalar exists only for the shell's columns (left panel, History, mount gate).

**Mount sequencing:** `actions-on-entity` and `workflows-events-timeline` fire their `onMount` reads off `entity_id`, so the left/right columns must mount _after_ the action loads. The shell gates the columns' render on `visible: _ne [ _state.entity_id, null ]` so their `onMount` fires once `entity_id` is set, rather than firing with a null id on first paint.

## Config shape

```yaml
workflows:
  - type: nc-internal
    title: Non-Conformance # breadcrumb Workflow label + title eyebrow (else humanized from type)
    entity: # per-workflow entity block (Part 57; replaces the `entities` map + flat entity_collection/entity_ref_key)
      connection_id: nc-collection # required — the entity's MongoDB collection connection id (see as-built note: the authored field is `connection_id`, NOT `collection`)
      ref_key: nc_ids # required — lifted to flat entity_ref_key; History matches events on it
      page_id: nc-view # deep-link target
      id_query_key: _id # URL query key (optional, default _id)
      title: Non-Conformance # entity TYPE label (always shown)
      name_field:
        reference # NEW (optional, D10) — dot-path into the entity doc for the instance NAME;
        #   when set, GetWorkflowAction projects it into entity_link.name → "Type · Name"
        #   when unset, the segment shows the type only (no extra query)
    entity_view:
      slot:
        _ref: modules/workflows/workflow_config/shared/nc-detail.yaml # Details tab — read-only blocks (config-root-relative)
    actions:
      - type: accept-or-reopen # form action -> three-tier {workflow}-{action}-{verb} pages
        kind: form
        # ...
      - type: rca-acceptance # check action -> three-tier {workflow}-check page
        kind: check
        # ...
```

History always renders — it sources its match field from the workflow's `entity.ref_key` (lifted to the flat `entity_ref_key`), which every workflow has. `entity_view` is optional and carries only the `slot` block array, rendered in the position that matches the action kind (D7): on **form** pages as the RHS **Details** tab (omitted ⇒ History is the sole RHS tab; present ⇒ Details + History tabs); on **check** pages in the **middle** as the review subject. The same `slot` serves both — `makeActionPages` bakes it into the form templates and the check page alike.

## Files changed

- `modules/shared/layout/title-block.yaml` — **add an optional `description` var** rendered in the subtitle slot, shown in place of the change-stamp line when set (D8). Additive and backward-compatible: pages that pass no `description` keep the existing change-stamp subtitle. The action pages pass the action's `message` here.
- `modules/layout/components/page.yaml` — **forward the new `description` var** into its `_ref` of `title-block.yaml` (default `null`). The `page` component `_ref`s `title-block` with an **explicit** var map (`:209-244`), so a page-level var not listed there never reaches the component — `description` must be added to the map for the action pages' `message` subtitle to render. Mechanically required by the `title-block` change above, not added scope.
- `modules/workflows/components/action-workspace.yaml` — **new** shared three-tier shell: `middle` / `universal_fields` / `details_slot` slots, baked `entity_collection` / `reference_field`, columns gated on `_state: entity_id`. The header is the layout `page` component's chrome, not the shell (D8).
- `modules/workflows/components/action-breadcrumbs.yaml` — **new** small config fragment returning the four-segment breadcrumb list (`- home: true`, Entity, Workflow, Action). `_ref`'d into each template's `breadcrumbs` var with `entity_link` / `workflow_id` / `action_label` / `workflow_title` vars (each template supplies its own state-path operators); bakes the `workflow-overview` pageId via `_module.pageId`. Page-only — the modal has no breadcrumb. (No custom title component: title/eyebrow/status are layout-page vars.)
- `modules/workflows/templates/{view,edit,review,error}.yaml.njk` — wrap the existing form body as the shell's `middle`; compose the Part 24 universal-fields card into the `universal_fields` slot; pass `entity_view.slot` as `details_slot` (RHS Details tab); pass the layout-page header vars — `breadcrumbs` (`_ref` the breadcrumbs fragment with `_state.action.*`), `type: <baked workflow_title>` (eyebrow); keep the existing `title` (baked action title) / `status` / `status_enum` wiring; pass `description: _state.action.message` (the message subtitle); set the normalized `_state.entity_id` in onMount; widen the page to full width.
- `modules/workflows/templates/check.yaml.njk` — **new** per-workflow check page. Recomposes the check surface across the shell (D6): `entity_view.slot` + comment + signal buttons as `middle`, universal-fields card as `universal_fields`, empty `details_slot`; passes the same header vars but sourced from `_state.current_action.*` (including `description: _state.current_action.message`). Derives mode in the response-derived `SetState` (D3) and sets `_state.entity_id` there too.
- `modules/workflows/components/check-action-surface.yaml` — **untouched** by D6 (the modal is a separate component from the workspace check page; no leaf extraction). It keeps its all-in-one arrangement, including its own inline title + status `Tag` (the modal is not a layout page, so it has no header chrome). (Its stale "canonical page" comment is re-pointed below — a comment-only change, see `:4`.)
- `modules/workflows/components/universal-fields/universal-fields.yaml` (Part 24) — composed by both the form templates and the check page into the shell's RHS; the check page now passes it `state_path: current_action.fields` / `current_action.*` (its previous middle-primary placement moves to the RHS). No new component work, a placement change owned here.
- `modules/workflows/resolvers/makeActionPages.js` — read `workflow.entity_view.slot`; pass the slot, `workflow.entity.collection` (as `entity_collection`), `workflow.entity.ref_key` (as `reference_field`), and a newly-resolved `workflow_title` (`workflow.title ?? humanizeSlug(workflow.type)` — `humanizeSlug` is already imported; used for the `type` eyebrow + the breadcrumb Workflow segment) to the templates; emit `{workflow_type}-check` when the workflow has ≥1 `check` action. **Reads the raw nested `entity:` block (Part 57), not flat `entity_collection`/`entity_ref_key`.** Part 57 already moves the existing `:86` `entity_collection: workflow.entity_collection` read to `workflow.entity.collection` (it is in Part 57's Files-changed), so this part **assumes the nested read** and adds the `entity.ref_key` + `entity_view.slot` reads to the same resolver. The two parts ship together; no compatibility shim for the flat shape.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — add `workflow_id` to the response envelope (`:233-260`, D9); resolve `entity_link.name` from the optional `wfConfig.entity.name_field` (D10) via one projected `findDocs` read (`limit: 1`) on `entity_collection` by `entity_id`; both gated/null-safe so unconfigured workflows are unaffected. **No connection `schema.js` change** — `name_field` rides through the workflow's `entity:` block (Part 57) into the `additionalProperties: true` `workflowsConfig`.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — `entity_view` is already excluded from the materialised engine config automatically (the `pick(workflow, WORKFLOW_FIELDS)` allowlist at `:104-109,770` omits it — no strip needed). Two changes: (a) **`name_field` survives into the materialized `entity` block via Part 57's wholesale routing-remainder carry** — Part 57 carries every non-lifted `entity:` field through `WORKFLOW_FIELDS` (not a fixed whitelist), so D10's optional `name_field` rides through to `wfConfig.entity.name_field` with no Part 56 carry change needed. (b) **Validation**: a new `entity_view` check (validate `slot` is a block ref) alongside the existing `validateWorkflow` / `validateAction`, plus the optional `entity.name_field` validation from D10 (on the `entity:` block Part 57 already validates here). This is the validation Part 4 owns.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — check branch → `{workflow_type}-check` (lines 116-121).
- `modules/workflows/pages/workflow-action-{view,edit,review}.yaml` — **retire** (replaced by emitted per-workflow check pages).
- `modules/workflows/module.lowdefy.yaml` — drop the three retired shared pages from `pages`; document `entity_view` in the workflow-config var description; document the optional `entity.name_field` on the workflow-config `entity:` block (D10, Part 57); re-point the export-description constraint (`:137-138`) off the retired `workflow-action-*` pages.
- `modules/workflows/README.md`, `docs/idioms.md` — document `entity_view` and the workspace layout. README also re-points the Exports table rows for the three retired pages and the "check actions use the shared `workflow-action-*` pages" line (`:300-302,308,317`).
- **Re-point the "canonical page" / duplicate-`get_workflow_action` constraint comments.** D3 retires the shared pages, so the comments naming them as canonical and as the duplicate-request hazard are now stale — the new `{workflow_type}-check` page is itself a URL-bound `get_workflow_action` page, so the "never drop the modal on a page that already defines `get_workflow_action`" constraint moves to it:
  - `modules/workflows/components/check-action-modal.yaml:6-7,22-25`
  - `modules/workflows/components/check-action-surface.yaml:4`
- Tests (unit — check-link retarget asserts the page value verbatim across the handler suite; every `workflows/workflow-action-{view,edit,review}` expectation for a **check** action becomes `workflows/{workflow_type}-check`; form-action expectations are unaffected):
  - `makeActionPages.test.js` (check-page emission + `entity_view` baking)
  - `computeEngineLinks.test.js:16-17,62,66-79` (check link target; the dedicated error-verb test is rewritten)
  - `GetEntityWorkflows.test.js:151-152,316,329,342,465,492`
  - `GetEventsTimeline.test.js:151-153`
  - `StartWorkflow.test.js:335,348,352`
  - `GetWorkflowAction.test.js:245-247`
  - `GetWorkflowActionGroupOverview.test.js:152-153,484`
  - `GetWorkflowOverview.test.js:157-158`
  - `planActionTransition.test.js:244,419-423,508`
- Tests (e2e — retargeting check links to `{workflow_type}-check` breaks specs that navigate to / assert the retired ids):
  - `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — `waitForURL`/assertions on `workflow-action-edit`/`-review` for check steps (e.g. `:124,314,361,425,595`) plus the negative `not.toContain('workflow-action-edit')` checks; retarget to `{workflow_type}-check`.
  - `apps/demo` Part 22 e2e — three-tier render + cross-action navigation.
  - `apps/workflows-test/e2e/workflows/check-blocked-by.spec.js:79,95,102,124` — URLs and `toHaveURL(/workflow-action-*/)` assertions retarget to `{workflow_type}-check`; update the surrounding fixtures/comments (`check-blocked-by.yaml:12`, `second-check.yaml:3`).

## Depends on / amends

- **Part 16 page-templates** (shipped) — edits the four `.yaml.njk` templates in place; they now also pass the layout-page header vars (`breadcrumbs`, `type`) alongside the existing `title` / `status`.
- **Layout module** (shipped) — the page header is the layout `page` component's native chrome (breadcrumb + `modules/shared/layout/title-block.yaml`'s eyebrow/title/status pill/back button). One small additive change: `title-block` gains an optional `description` var rendered in the subtitle slot (the action's `message`), shown in place of the change-stamp line when set (D8), and `modules/layout/components/page.yaml` forwards that var into its `title-block` `_ref` (the var map at `:209-244` is explicit, so the forward is mechanically required); otherwise this part only passes vars the component already accepts. The shared `title-block` config is the reuse target for the center-only fallback.
- **Part 17 shared-pages** (shipped) — retires the three shared `workflow-action-*` pages it introduced; reuses its `workflow-overview` page (the breadcrumb Workflow segment links to it via `?workflow_id=`).
- **Part 57 inline-entity-config** (prerequisite — lands before this part) — consolidates **all** of a workflow's entity wiring onto one per-workflow `entity:` block (`collection`, `ref_key`, `page_id`, `id_query_key`, `title`), validated by `makeWorkflowsConfig`, lifting `entity.collection`/`entity.ref_key` to the flat `entity_collection`/`entity_ref_key` the engine/docs/queries use and carrying the routing remainder into the materialized `entity` object via `WORKFLOW_FIELDS`. Two consequences for this part:
  - **Build-time reads move to the nested block.** Both this part's resolvers read raw YAML, so `makeActionPages` reads `workflow.entity.collection` / `workflow.entity.ref_key` (not the flat names). **Part 57 owns updating `makeActionPages.js:86`'s existing `workflow.entity_collection` read** to the nested shape — it is now in Part 57's Files-changed (it predates this part and goes stale the moment Part 57 changes the authored shape). This part assumes the nested read and adds only the `entity.ref_key` + `entity_view.slot` reads.
  - **`name_field` rides the routing remainder.** D10's optional `name_field` is one more field on the `entity:` block, read from the resolved `wfConfig.entity.name_field`. Because the block reaches the connection inside the `additionalProperties: true` `workflowsConfig`, **no connection `schema.js` change is needed**, and **Part 57's wholesale routing-remainder carry preserves `name_field`** (Part 57 carries every non-lifted `entity:` field, not a fixed whitelist), so this part adds no carry change — only the optional validation (Task 4).
    This part depends on Part 57 and sequences after it; the two ship together.
- **Part 40 check-action surfaces** (shipped) — the modal (`check-action-surface.yaml`) is **untouched** (D6): it stays a separate component from the new workspace check page, which is authored standalone and duplicates the few controls it needs (signal buttons, comment, status history, and the copied mode-derivation ladder per D3). The standalone shared check pages are retired and replaced by the per-workflow page.
- **Part 42 / Part 55** — relies on the `actions-on-entity` + `check-action-click` no-modal degrade path.
- **Part 46 / Part 50** — reuses `workflows-events-timeline`; the History tab here is the module-baked counterpart to Part 50's app-composed `events_tile`.
- **Part 24 universal-fields** (shipped) — central to the reshape: the universal-fields card is composed into the shell's RHS for **both** kinds (D2). On form pages this matches Part 24's existing RHS placement; on check pages it moves the card from middle-primary to the RHS. This part owns that placement change for the workspace check page (the modal keeps Part 24's in-body placement).
- **Part 4 config schema** — adds optional `entity_view` to the workflow grammar + validates `slot` is a block ref; adds optional `name_field` to the workflow `entity:` block (D10, on the block Part 57 introduces). `entity.ref_key` (required-checked by Part 57, lifted to the flat `entity_ref_key`) is reused unchanged for History. The workflow-grammar `title` field D9 uses for the breadcrumb/eyebrow label already exists (in `WORKFLOW_FIELDS` and validated — `makeWorkflowsConfig.js:33,591`; actions at `:532`) and needs no schema change.

## Verification

- Form action page renders three columns: middle = the form body; RHS = universal-fields card + Details/History tabs; left = the entity's workflows.
- Check action page renders the same scaffold: middle = `entity_view.slot` + comment + signal buttons; RHS = universal-fields card + History (no Details tab); left = the entity's workflows.
- **No-jarring-shift:** navigating form↔check via the left panel keeps the left column and the RHS universal-fields card in place; only the middle content (and the presence of the Details tab) changes.
- Universal fields render in the RHS on both kinds; the card is read/written via Part 24's `state_path` (form `fields`, check `current_action.fields`).
- A `check` action's `action.link` resolves to `{workflow_type}-check`; opening it derives the correct mode per stage/allowed (parity with `check-action-modal`); the retired `workflow-action-*` ids no longer resolve.
- `entity_view.slot` renders read-only — RHS Details tab on form, middle on check; omitting `entity_view` drops the Details tab (form) / leaves the middle decision-only (check) while History (sourced from `entity_ref_key`) still renders.
- Clicking another action in the left panel navigates to its page (check included) via the degrade path.
- `entity_view` does not appear in the materialised `workflows_config` consumed by the engine.
- The modal is a separate, untouched component (D6): the in-context `check-action-modal` renders and behaves exactly as before (keeps its own inline title + `Tag`); the workspace check page is its own composition and does not `_ref` the modal's surface.
- **Header:** every action page renders the layout page's native chrome — a breadcrumb `Home / {entity type[· name]} / {workflow title} / {action title}` plus a full content-width title bar (workflow-title eyebrow + action title + status pill) above the three columns. The header sits in the same position on every action page, so navigating between actions reads as continuity.
- The Workflow breadcrumb segment links to `workflow-overview?workflow_id=…` (envelope now carries `workflow_id`); the Entity segment links to the entity page.
- With the workflow's `entity.name_field` set, the Entity segment shows "{type} · {name}"; with it unset, it shows the type only and no extra entity query fires.
- Status `Tag` reflects `status[0].stage` via the `action_statuses` enum; the title reads the baked action title (`page_config.title`); the subtitle reads the action's `message` (via the new `description` var); the eyebrow reads the baked workflow title.
- Narrow viewport: the three columns stack to full width.
- E2E: covered by Part 22 once a workflow fixture declares `entity_view`.

## Implementation notes (as-built)

Two points where the shipped code diverges from the design text above; the code is
authoritative, this section records the reconciliation.

- **The authored entity field is `connection_id`, not `collection`.** This design
  was written before Part 57 finalised the per-workflow `entity:` block. Part 57
  shipped the entity's MongoDB collection-connection field as **`entity.connection_id`**
  (a connection id like `leads-collection`), not `entity.collection`, and there is
  no flat `entity_collection` lift — the resolvers read `workflow.entity.connection_id`
  directly. So every mention of `entity.collection` / `entity_collection` above
  (config shape, shell vars, Files-changed, D2/D10, the Part 57 dependency) reads
  `entity.connection_id` in the code. The corresponding template/shell var names
  follow suit: `makeActionPages` passes `connection_id`, and the shell var is
  `entity_connection_id` (not the design's `entity_collection`). The `entity.ref_key`
  → History `reference_field` wiring is unchanged.

- **The three-tier render e2e spec was intentionally not authored.** Task 12's
  retargets (check-link navigation → `{workflow_type}-check`) and fixture updates
  shipped, and the `entity_view` slot was wired into the demo `onboarding` workflow
  (`apps/demo/.../onboarding/lead-detail-slot.yaml`, with `entity.name_field: name`
  exercising D10) so the slot bakes into the form pages (Details tab) and the
  `onboarding-check` page (middle). But the **new** Part 22 spec asserting three-tier
  render + cross-action navigation + no-jarring-shift was **not** written: the only
  Part 22 spec (`onboarding-happy-path.spec.js`) is quarantined (`test.skip`) against
  the current nav model, e2e cannot run in the build sandbox, and an unrunnable
  selector-level spec risks false confidence. Live three-tier coverage is therefore
  a `/r:dev-test` (human-run) deliverable, not an automated gate. Unit coverage
  (shell-emitting resolvers, `computeEngineLinks`, `GetWorkflowAction` envelope) and
  the demo build check stand in for it at CI time.

## Open questions

- **Current-action highlight.** `ActionSteps` has no `active`/`selected` prop today (`plugins/.../ActionSteps`). Highlighting the current row (as the screenshot does) needs a small block prop fed the loaded `action._id`, or a CSS-only treatment. Lean: add a minimal `activeActionId` prop to `ActionSteps`; defer if it slips scope — the layout works without it.
- **Slot entity-data fetch.** The read-only `slot` authors its own read off the normalized `_state.entity_id`. Whether the module should standardise that fetch via Part 26's `get_entity_endpoint` (so slots consume one shaped object instead of each writing a request) is left to Part 26; this part only guarantees `_state.entity_id` (set by every action page) and the build-time-baked `entity_collection`.
- **Right-panel sizing.** Default column spans (e.g. 6/12/6 on `lg`, 24 on `sm`) and a max-height/scroll on the History tab are sensible defaults; tune during implementation against real content.
- **Header subtitle fallback.** The subtitle shows the action's `message` (D8). If that reads poorly against real content (e.g. a terse or missing message), a fallback — assignees, or suppressing the subtitle — is decided at the screen during implementation, not spec'd now.
- **Full-width vs center-only title bar.** Shipping full-width (D8); the center-only fallback (suppress with `hide_title`, `_ref` the shared `title-block` into the center column) is the documented escape hatch if the full-width bar feels heavy against the three-column workspace. Decide against real content during implementation.
- **`name_field` resolution scope.** This part resolves the entity instance name only in `GetWorkflowAction` (where the breadcrumb needs it). If `GetEntityWorkflows` / `GetWorkflowOverview` later want the name in their `entity_link`s, extract a shared `buildEntityLink` helper rather than duplicating the lookup.

## Non-goals

- **Editable entity views** — the slot is read-only (proposed change 6).
- **A declarative entity-detail spec** — rejected in D2; the slot is app blocks.
- **Per-entity (rather than per-workflow) config** — rejected in D1.
- **Changing the in-context `check-action-modal`** — its body and behaviour are unchanged; it remains the entity-page shortcut. Per D6 it is a separate component from the workspace check page, so `check-action-surface.yaml` is not touched at all.
- **Moving entity-page furniture into the module** — the workspace is the module's _own_ action pages; entity view pages keep composing `actions-on-entity` / `events_tile` themselves (Part 50).
