# Titles strategy

The workflows module needs a human-readable **title** for many things — workflows, actions, action groups, the action's pages, and the verb in every timeline event ("Sam submitted Send Quote"). Today these titles are handled inconsistently: a few fixed concepts (status badges, lifecycle stages) carry good hand-written titles, but every author-defined concept (workflow `type`, action `type`, group `id`) is an optional field with **no default and no humanizer anywhere in the repo** — so unset titles surface as raw slugs (`send-quote`), blank labels, or machine-y event copy ("marked send-quote as in-review"). Actions have no title field at all.

This design makes titles consistent and low-effort across the whole module: **every title gets a good default derived from what's already declared, and authors override only when the default is wrong.** Authors stop writing a title for every action; the defaults are good enough that the override is the exception, not the rule.

## Proposed change

1. **One `humanizeSlug` helper** — turns a slug (`send-quote`, `upload_po`) into a good Title Case string ("Send Quote", "Upload PO") using smart minor-word casing and a curated, app-extensible acronym dictionary. This is the single thing that makes derived defaults *good* rather than merely mechanical.
2. **A new optional action `title` field**, and a build-time default for every open-slug title: workflow `title` ← `humanizeSlug(type)`, action `title` ← `humanizeSlug(type)`, action group `title` ← `humanizeSlug(id)`. An explicit `title:` always wins.
3. **Per-signal verb templates for event messages** — replace the single catch-all `action-event` template with a curated map keyed by FSM signal, composed over the action/workflow title ("Sam **completed** Send Quote", "Sam **approved** Send Quote"). Subsumes part 51's F24 / D6.
4. **Materialize defaults once at build** in `makeWorkflowsConfig`, and **denormalize the action title onto the action doc** so every consumer — request resolvers, blocks, action pages, the event planner — reads a guaranteed-present `title` with no scattered runtime fallbacks.
5. **Action page titles default to the action title** (`page_config.title`), closing part 51's F1 title gap through the same mechanism.
6. **Document the convention** (the derive-or-override rule, the acronym dictionary, the signal verb map) in the manifest + README, and update the demo configs to drop now-redundant titles and exercise the override path.

## The principle: curated vs derived, always overridable

Every title-bearing concept in the module falls into one of two populations, and the right default differs:

- **Fixed, engine-known slug sets** — action statuses (`action_statuses.yaml`), workflow lifecycle stages (`workflow_lifecycle_stages.yaml`), and **FSM signals** (`fsm/tables.js`). These slugs are closed and engine-locked; their human strings are *curated once* in the module ("Action Required", "In Review", "approved"). Authors never see or set them.
- **Open, author-defined slug sets** — workflow `type`, action `type`, action group `id`. These slugs are invented per app; their human strings are *derived* from the slug via `humanizeSlug`, and overridable with an explicit `title:`.

Composite strings (timeline event messages) are built by combining the two: a **curated signal verb** × a **derived-or-overridden noun title**.

This split is the spine of the design. It explains why statuses keep their enum titles untouched, why signals get a hardcoded verb map, and why only `type`/`id` get the humanizer.

## `humanizeSlug` — making derived titles good

A pure helper, shipped in the module's resolver utilities and used wherever an open-slug default is computed.

```
humanizeSlug('send-quote')             → 'Send Quote'
humanizeSlug('assign-account-manager') → 'Assign Account Manager'
humanizeSlug('upload-po')              → 'Upload PO'        // acronym
humanizeSlug('convert-to-customer')    → 'Convert to Customer'  // minor word
humanizeSlug('company_setup')          → 'Company Setup'    // snake
humanizeSlug('kickoffCall')            → 'Kickoff Call'     // camel boundary
```

Rules:

1. **Split** on `-`, `_`, and camelCase boundaries into word tokens.
2. **Title-case** each token (first letter upper, rest lower).
3. **Minor words** (`a an and as at but by for from in nor of on or the to via with`) are lowercased **unless** they are the first or last token. → "Convert **to** Customer", but "**To** Do".
4. **Acronyms** — a token whose lowercased form is in the acronym set is fully uppercased. Base set ships in the module (`PO ID URL API CRM SLA KPI VAT PDF CSV FAQ KYC RFQ`-class business/web acronyms — finalized in the build list). Always capitalized regardless of position.
5. First token always starts with a capital.

### App-extensible acronyms

Domain acronyms (BOM, SKU, …) are app-specific, and without them an app's defaults degrade to "Bom" — defeating the whole point. So the acronym set is extensible via a module var:

```yaml
modules:
  - id: workflows
    vars:
      title_acronyms: [BOM, SKU]   # merged into the base set
```

`makeWorkflowsConfig` reads `title_acronyms` (default `[]`), merges it into the base set, and passes the combined set to `humanizeSlug` for all build-time defaulting. Documented in the manifest as a top-level var.

## Per-concept resolution

Every title resolves by the same rule — **explicit `title` wins; else derive/curate; materialized at build** — but the source and the display surfaces differ. `makeWorkflowsConfig` writes the resolved `title` onto the runtime config so consumers never default at read time.

| Concept | Slug source | Default | Override | Materialized in | Read by |
|---|---|---|---|---|---|
| Workflow title | `workflow.type` | `humanizeSlug(type)` | `workflow.title` | `makeWorkflowsConfig` (already in `WORKFLOW_FIELDS`) | overview page, entity-workflows, Get*Overview / GetEntityWorkflows resolvers |
| Action title (**new**) | `action.type` | `humanizeSlug(type)` | `action.title` | `makeWorkflowsConfig` (add `title` to picked action fields) **+ denormalized onto the action doc** | **From config:** ActionSteps / overview cards / actions-on-entity (via `GetEntityWorkflows`, which reads `wfConfig.actions` like it already reads group title), action pages (`makeActionPages`). **From the doc:** the event planner (`plannedActionDoc`) only. |
| Action group title | group `id` | `group.title` if present (enum- or author-supplied) → else `humanizeSlug(id)` | `action_groups[].title` in workflow config | `makeWorkflowsConfig` (group normalization) | ActionSteps, GetEntityWorkflows |
| Action page title | — | the resolved action title | `action.pages[verb].title` | `makeActionPages` defaults `page_config.title` to the action title | the `view/edit/review/error` templates (`page_config.title`) |
| Status badge title | stage slug | curated enum, **unchanged** | — | `action_statuses.yaml` | overview badge, ActionSteps |
| Lifecycle stage title | stage slug | curated enum, **unchanged** | — | `workflow_lifecycle_stages.yaml` | overview badge |
| Event message | FSM signal | curated signal verb map × noun title (below) | 3-source event override chain (engine → YAML `event_overrides[signal]` → pre-hook) | `planEventDispatch` `DEFAULT_SIGNAL_TITLES` | EventsTimeline |

Group title precedence is **2-tier at the resolver: `group.title ?? humanizeSlug(group.id)`**. The shared `enums/action_groups.yaml` still owns `title`/`icon`/`order`, but those are `_ref`'d into the workflow YAML *upstream* of the resolver, so by the time `makeWorkflowsConfig` runs they're already inline in `group.title` — the resolver can't (and needn't) distinguish an enum-supplied title from an author override; both just present as `group.title`. A group with neither an enum entry nor an explicit title now gets a sane derived label instead of a raw id.

## Event messages — per-signal verb templates

The event type is already `action-${signal}` (`planEventDispatch.js:137`), so the signal is known at dispatch. Replace the single `DEFAULT_TITLES['action-event']` catch-all ("marked {{ action.type }} as {{ status_after }}") with a verb map keyed by signal. The noun is now `{{ action.title }}` / `{{ workflow.title }}` (always present), and the FSM signal set (`fsm/tables.js`) is closed, so the map is exhaustive and curated.

**Actor-driven action signals** (submit path — a real user acts): `{{ user.profile.name }} <verb> {{ action.title }}`

| Signal | Resolves to | Default message |
|---|---|---|
| `submit` | `done` (no review) | `{{user}} completed {{action.title}}` |
| `submit` | `in-review` (has review) | `{{user}} submitted {{action.title}} for review` |
| `approve` | `done` | `{{user}} approved {{action.title}}` |
| `request_changes` | `changes-required` | `{{user}} requested changes on {{action.title}}` |
| `progress` | `in-progress` | `{{user}} started {{action.title}}` |
| `not_required` | `not-required` | `{{user}} marked {{action.title}} as not required` |
| `resolve_error` | `in-review` | `{{user}} resolved an error on {{action.title}}` |

The `submit` verb depends on `status_after` (the only branch — "completed" vs "submitted for review"), exactly the function-cell split the FSM already encodes (`submitTarget`, `tables.js:32`).

**System-driven signals** (no human actor — never attribute to a user):

| Signal | Default message |
|---|---|
| `internal_mirror_child_active` | `{{action.title}} started` |
| `internal_mirror_child_completed` | `{{action.title}} completed` |
| `internal_mirror_child_cancelled` | `{{action.title}} cancelled` |

**Lifecycle signals** (workflow-level handlers): `{{ user.profile.name }} <verb> {{ workflow.title }}`

| Handler | Default message |
|---|---|
| StartWorkflow | `{{user}} started {{workflow.title}}` |
| CancelWorkflow | `{{user}} cancelled {{workflow.title}}` |
| CloseWorkflow | `{{user}} closed {{workflow.title}}` |

**Fallback.** Any signal not in the map (defensive — e.g. an auxiliary `block`/`activate`/`unblock` that ever became primary) falls to `{{user}} updated {{action.title}}`, never the raw-slug string. In practice the internal/auxiliary signals (`internal_cancel_action`, and `block`/`activate`/`unblock` when they aren't the primary signal) never reach `planEventDispatch` at all: each invocation dispatches exactly one event for its primary signal, and cascade cancels surface as the `workflow-cancelled` lifecycle event rather than a per-action signal. So the map only needs to cover the primary signals above to be exhaustive — the fallback is purely defensive. The stage's curated `action_statuses` enum `.title` is available in the render context if an app override wants "as {{ status_title }}" phrasing.

These are **defaults only** — the existing 3-source override chain is unchanged, so an app can still rewrite any signal's message via `event_overrides[signal]` or a pre-hook.

## Architecture: build-time materialization + denormalized doc fields

The defaulting happens in exactly two build/runtime places, and every consumer stays dumb:

1. **`makeWorkflowsConfig` (build).** During normalization it resolves and writes `title` for the workflow, each action, and each group into the runtime `workflowsConfig`. After build, the config carries real titles — config-reading surfaces (overview/entity-workflows resolvers, action-page generation) just read `title`. This is the "one correct way": the default is materialized once, not re-derived at each read site.
2. **Runtime denormalization onto the persisted docs.** Both the action and the workflow are doc-rendered for events, so each carries its resolved title on the stored doc — the same stance the module already takes for `type`/`kind`/`workflow_type`:
   - **Action title → action doc (`planActionTransition`).** Add `doc.title = actionConfig.title;` to the **unconditional denormalization block** (`planActionTransition.js:175+`, alongside `doc.workflow_type`), *not* the insert branch. The insert branch (`:141-164`) only runs on first creation; a submit on an existing action takes the update branch (`:165-173`, which spreads `...action`), and that updated doc is what `planSubmit` hands to `planEventDispatch`. Stamping in the unconditional block covers every transition — insert and update, new and pre-existing actions — so `{{ action.title }}` is always present on the planned doc. Doc-reading surfaces — the event planner (`plannedActionDoc`) and the timeline (which joins action docs) — then get the title without a config lookup.
   - **Workflow title → workflow doc (`StartWorkflow`).** `baseWorkflowDoc` (`StartWorkflow.js:169-177`) carries `workflow_type` but no `title`, while `workflowConfig` (with `.title`) is already in scope at `:70`. Add `title: workflowConfig.title` to `baseWorkflowDoc` so the title persists in the DB. The lifecycle render context binds `workflow = plannedWorkflowDoc` (`planEventDispatch.js:105`), so StartWorkflow gets it directly, and Cancel/Close — which load the existing workflow doc — get it for free without re-reading config.

The `humanizeSlug` helper therefore lives in the **module resolvers** (build side) only; the plugin never humanizes at runtime because the config it receives is already resolved.

### Data flow

```
workflow YAML (type/id slugs, optional title:)
        │  build
        ▼
makeWorkflowsConfig ── humanizeSlug + title_acronyms ──► runtime workflowsConfig (title always present)
        │                                                        │
        │ makeActionPages: page_config.title ← action.title      │ request-time resolvers read title
        ▼                                                        ▼
   action pages                                          overview / entity-workflows / ActionSteps
        
runtime: StartWorkflow ── title: workflowConfig.title ──► workflow doc (denormalized title, persisted)
        │                                                        │
        ▼ Submit                                                 │ Cancel/Close load the doc → title for free
planActionTransition ── title: actionConfig.title ──► action doc (denormalized title)
        ▼
planEventDispatch ── DEFAULT_SIGNAL_TITLES[signal] over {{action.title}} / {{workflow.title}} ──► event doc ──► EventsTimeline
```

## Files changed

**Module (`modules/workflows`)**
- `resolvers/humanizeSlug.js` — **new** pure helper + base acronym set.
- `resolvers/makeWorkflowsConfig.js` — resolve+default `title` for workflow / action / group; add `title` to picked action fields; read+merge `title_acronyms`; validate `title` is a string when present.
- `resolvers/makeActionPages.js` — default `page_config.title` to the resolved action title when `action.pages[verb].title` is absent.
- `module.lowdefy.yaml` — declare the `title_acronyms` var (description/type/default); note the action `title` field.
- `README.md` / `docs/idioms.md` — document the derive-or-override rule, the acronym dictionary, and the signal verb map.

**Plugin (`plugins/modules-mongodb-plugins`)**
- `connections/shared/phases/planners/planEventDispatch.js` — replace `DEFAULT_TITLES['action-event']` with `DEFAULT_SIGNAL_TITLES` (signal-keyed verb map + submit/status_after branch + fallback); lifecycle templates use `workflow.title`.
- `connections/shared/phases/planners/planActionTransition.js` — add `doc.title = actionConfig.title;` to the unconditional denormalization block (alongside `doc.workflow_type`), so title is stamped on insert and update alike.
- `connections/WorkflowAPI/StartWorkflow/StartWorkflow.js` — add `title: workflowConfig.title` to `baseWorkflowDoc` so the workflow title persists on the doc (Cancel/Close read it from the loaded doc).

**Demo (`apps/demo/modules/workflows`)**
- Workflow/action/group configs: drop titles now equal to the derived default; keep/add an explicit `title` only where the slug humanizes wrong (e.g. acronyms, custom phrasing) to exercise the override path.

## Migration

No data migration required, and no read-time fallback. The denormalized doc `title` is the one field that could go stale, but it is **written and read in the same plan**: `planActionTransition` stamps `doc.title = actionConfig.title` and hands that same planned doc straight to `planEventDispatch`, which is the only reader of the doc title. The stored value is never read again on any later surface — every display surface (overview, ActionSteps, entity-workflow cards, action pages) reads the title live from config, and the timeline reads the frozen `display` string off the event doc. So:

- **This rollout.** Pre-existing action docs lack `title`. They need no backfill: display surfaces source it from config, the next transition stamps the doc, and historical events keep their already-rendered `display` strings.
- **A future config change** (renaming a title, editing `title_acronyms`, changing the humanizer). Display surfaces reflect it immediately because they read config every time. The stored doc `title` goes stale, but since nothing reads it after it was stamped, the drift never surfaces — and the next event re-stamps from the new config before rendering. No re-sync job, ever.

## Decisions

- **Optional-with-good-default over required `title`.** With a genuinely good humanizer, defaults win on authoring efficiency and consistency, and eliminate the inconsistent hand-rolled titles that a required field invites. Required would force redundant `title: Send Quote` beside `type: send-quote`. The escape hatch (`title:`) covers the cases the humanizer gets wrong. *(This reverses the earlier part-51 lean toward required, which was made before a good humanizer was on the table.)*
- **Build-time materialization over runtime fallback.** One defaulter, dumb consumers — no per-surface `?? humanize(type)` scattered across resolvers and blocks. Matches "one correct way."
- **Signals get a curated verb map, not a derived one.** The FSM signal set is closed and engine-locked, so verbs are hand-written once (like the status enum), not humanized. This is what delivers "completed" / "approved" / "requested changes" instead of "marked … as …".
- **Form-field titles stay author-only.** Defaulting a field label from its key is the one risky case (blank labels are sometimes intentional — checkboxes, layout blocks), and the value is lower. Out of scope; fields keep today's optional `title`.
- **`status_title` left untouched.** The reserved per-stage `status_map.*.status_title` field is a separate status-copy concern, not a name/title; this design does not change it.
- **Acronym set is app-extensible.** A fixed base set can't know domain acronyms; without extension, acronym-heavy apps fall back to manual titles everywhere, defeating the goal. The `title_acronyms` var is cheap and directly serves "good defaults."

## Open questions

- **Final base acronym list** — settle the shipped set during the build (start from the web/business acronyms above; keep it small and uncontroversial, since apps extend via `title_acronyms`).

## Non-goals

- Status-stage and lifecycle titles (already curated in enums) — unchanged.
- Status-map `message` copy and `status_title` — contextual prose with no derivable default; left as author-only.
- Form-field title defaulting — explicitly out of scope (see Decisions).
- The non-title part-51 fixes (timeline rendering, overview layout, file upload, check-action surface) — those stay in part 51; only F24 (and F1's title gap) are absorbed here.

## Related

- Supersedes part 51 **F24** (default event messages) and **D6**; closes the title half of part 51 **F1** (action page titles). Part 51 retains its other fixes.
- Builds on part 51 **D4** (surface action identity) — the action `title` is the identity field D4 wants on cards/rows/steps.
