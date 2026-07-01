# Workflow action ordering

Workflow actions render in the wrong order — and on most surfaces, in no meaningful order at all. The read engines sort actions by `action.sort_order`, but `sort_order` is **never written onto action documents**, so the field reads as `undefined` everywhere and the sort silently collapses to whatever timestamp tiebreaker follows it. This design replaces the dead `sort_order` sort with a **declaration-order** model computed server-side from the workflow config: actions order by their group's position in `action_groups[]`, then by the action's position in `actions[]`. Order becomes a config-only concern — nothing is persisted, nothing migrates, and no config crosses to the client.

## Proposed change

1. Introduce one shared comparator, `makeWorkflowOrderComparator(workflowsConfig)`, that orders action docs by `(group declaration index, action declaration index, _id)`, resolving each action's config via its persisted `workflow_type`.
2. Use it in all four read engines that order actions — `GetEventsTimeline`, `GetWorkflowOverview`, `GetEntityWorkflows`, `GetWorkflowActionGroupOverview` — so there is exactly one ordering definition.
3. Fix the timeline (F12): replace the `$sortArray: { sort_order, updated.timestamp }` stage in `GetEventsTimeline` with the comparator applied in JS post-processing (where the config is available), keeping the latest event at the top (Part 51 F15).
4. Retire `sort_order`: stop reading it in the engines, drop it from `ACTION_FIELDS` in `makeWorkflowsConfig.js`, remove it from the action-authoring spec, and strip it from the demo configs. Declaring it becomes a harmless no-op.
5. Fold the "not-required sinks last" rule into the comparator as a within-group key and apply it on **all four** surfaces — including `GetWorkflowOverview`, which does not sink today — so status ordering is uniform rather than a per-surface policy each caller must remember (D4).

## Key decisions

### D1 — Declaration order, not a numeric `sort_order` field {#d1}

`sort_order` is a per-action number the author must keep monotonic and group-aligned by hand. The reference app it was ported from uses it globally (0, 20, 90, 110, …) and sorts both its timeline and overview by `sort_order` alone, with no group dimension — it works there only because the author maintains the invariant. That's the "convention that relies on every caller remembering" anti-pattern, and it's fragile exactly where ordering isn't re-bucketed by group (the timeline renders a flat list).

The author already declares intent twice, in ordered arrays the build controls and validates: `action_groups[]` (group order) and `actions[]` (action order). Sorting by those array positions makes the YAML the single source of truth — there is no second number to keep in sync, nothing to re-gap when an action is inserted, and no global-vs-per-group ambiguity. It is group-aware by construction, so groups stay contiguous and in declared order regardless of anything else.

**Rejected alternative — keep `sort_order` as an optional config override** (`(groupIndex, config.sort_order, declIndex, _id)`, read from config, not the doc). This preserves an explicit reorder knob without moving YAML blocks, and is still migration-free. Rejected because it reintroduces the maintain-a-number burden and a second ordering axis for no concrete need — declaration order already lets authors reorder by moving a block. If a real need for a non-declaration override surfaces, this is the place to add it back.

**Rejected alternative — `blocked_by` topological order.** An early concept design (`action-authoring/design.md:277`) described display order falling back to a topological sort over `blocked_by`, tie-broken by declaration order. This was **never implemented** — no engine has ever read `blocked_by` for ordering (it exists only as a config-validation check in `makeWorkflowsConfig.js:544–552`, where an entry may resolve to either a group id _or_ an action type). It is rejected outright and not a base case: real topological ordering means resolving group-or-type references and handling cycles for zero concrete benefit, since an author declaring actions in dependency order already gets the identical result from plain declaration order. Declaration order is _the_ ordering model, not a fallback. The contradicting concept-doc prose is corrected as part of this design so the model is not relitigated.

### D2 — Order is computed server-side, from already-persisted fields {#d2}

The comparator runs inside the engine, which already holds `workflowsConfig` in its connection context (it uses it for the workflow `title`, `form_meta`, group display, and the existing `groupIndex` helper in `GetWorkflowOverview`). Access gates and link collapse read **persisted** fields (`action.access`, `<app>.links`), not the config — but the config is on the context regardless, so no DB lookup is needed. Action docs already persist `type`, `action_group`, and `workflow_type` (`planActionTransition.js`), so the comparator needs no new data and no DB lookup. The engines emit the same plain, pre-ordered card/action arrays they emit now — **only ordered results cross the wire, never the config blob**. This keeps the client contract identical and does not undo the Parts 18/19/48 work that moved actions onto read APIs.

Because order is derived from config at read time, reordering a workflow's config reorders display for in-flight workflows immediately, with no migration. That is already true for group ordering today and is the desired behavior.

### D3 — One comparator, four engines {#d3}

The dead `sort_order` sort is not a timeline-only bug; `GetWorkflowOverview`, `GetEntityWorkflows`, and `GetWorkflowActionGroupOverview` all read `action.sort_order ?? 0` and all currently fall through to a timestamp tiebreaker. Fixing only the timeline would leave three surfaces ordering by `created.timestamp`. A single shared comparator fixes all four and guarantees they agree.

The comparator resolves config **per action** via `action.workflow_type`, so it works whether a surface holds one workflow (overview, entity, group-overview) or many (the timeline aggregates events across all of an entity's workflows). Non-workflow timeline cards (`workflow_id: null`, no `workflow_type`) have no config; they sort after workflow cards, by `_id`.

### D4 — `not-required` sinks within group, folded in, on every surface {#d4}

`GetEntityWorkflows` and `GetWorkflowActionGroupOverview` already push `not-required` actions to the bottom of their group before ordering; `GetWorkflowOverview` and `GetEventsTimeline` do not. Rather than preserve that split, the sink is **folded into the comparator** as a second key (after `groupIndex`, before `declIndex`) and applied **everywhere**, so all four surfaces order identically — the agreement D3 promises now covers status too.

Folding it in is correct _because_ the behavior is universal. A per-surface "compose an extra key" rule is something each caller must remember to apply — and `GetWorkflowOverview` already forgot. One key inside one comparator can't drift. The key sits **after `groupIndex`**, never first, so a not-required action sinks to the bottom of _its own group_ without escaping it — preserving D1's contiguous, declaration-ordered groups.

The timeline is the one judgement call. Its `$lookup` only cards actions that have _done real work_ (`GetEventsTimeline.js:79–108` — current stage ≠ `blocked`, and at least one history stage was neither `blocked` nor `not-required`), so a card whose _current_ stage is `not-required` means "completed, then later deprecated." Sinking those to the bottom of their event group is intended and rare; keeping the rule uniform beats carving out an exception.

**Rejected alternative — keep it separate, composed ahead per-caller** (the original D4). That made sense only while sinking was a 2-of-4 per-surface policy. Once we sink everywhere it just spreads one definition across four call sites and re-invites exactly the `GetWorkflowOverview`-style omission this design fixes.

## Current state analysis

### `sort_order` is read but never written

The canonical action-creation path, `planActionTransition.js` (the `insert` branch, lines 143–164), writes `type`, `kind`, `key`, `action_group`, `status`, `entity_*`, `assignees`, `due_date`, `description`, `tracker`, `created`, `updated`, and denormalizes `access` + `workflow_type` (lines 182–183). It does **not** write `sort_order`. No other creation path in `connections/shared/` touches it.

Every read engine nonetheless sorts by it:

| Engine                                 | Sort key today                                         | Effective behavior                                     |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `GetEventsTimeline.js:185`             | `$sortArray { sort_order: 1, 'updated.timestamp': 1 }` | `sort_order` absent → orders by `updated.timestamp`    |
| `GetWorkflowOverview.js:82`            | `(groupIndex, sort_order, _id)`                        | `sort_order ?? 0` ties → orders by `_id` within group  |
| `GetEntityWorkflows.js:97`             | `(not-required, sort_order, created.timestamp)`        | `sort_order ?? 0` ties → orders by `created.timestamp` |
| `GetWorkflowActionGroupOverview.js:70` | `(not-required, sort_order, created.timestamp)`        | same                                                   |

`GetWorkflowOverview` additionally computes a runtime `groupIndex` from `action_groups` (lines 52–55, 78) — the right idea, but coupled to the dead `sort_order`. `GetEntityWorkflows` already orders group _sections_ structurally by iterating `action_groups` in declaration order (line 107) and only uses `sort_order` for within-group ordering; that within-group key is the dead part.

### The `_group_index` that never was

The design history refers to a `$sort: { _group_index: 1, sort_order: 1, _id: 1 }`. No `_group_index` field exists in any code — port or reference. It only ever named an aggregation-computed value in design prose. In our engines the equivalent is a plain runtime `groupIndex` variable (`action_groups.indexOf(...)`), never persisted. A literal `_group_index` field would also violate the repo rule against underscore-prefixed aggregation fields (Lowdefy parses leading `_` as operators).

## Proposed model

### The comparator

`makeWorkflowOrderComparator(workflowsConfig)` returns a comparator over action docs:

```
key(action):
  cfg         = workflowsConfig.find(w => w.type === action.workflow_type)
  groupIndex  = cfg ? cfg.action_groups.findIndex(g => g.id === action.action_group) : ∞
  declIndex   = cfg ? cfg.actions.findIndex(a => a.type === action.type)            : ∞
  stage       = Array.isArray(action.status) ? action.status[0]?.stage : action.status
  notRequired = stage === 'not-required' ? 1 : 0
  // findIndex → -1 (unknown group / removed action type / no config) sorts last
  return [ groupIndex === -1 ? ∞ : groupIndex,
           notRequired,                              // within-group: not-required sinks last
           declIndex  === -1 ? ∞ : declIndex,
           action.key ?? '',
           String(action._id) ]

compare(a, b): lexicographic over key(a) vs key(b)
```

- **`not-required` sinks within its group** (D4) — the second key, after `groupIndex` and before `declIndex`, so a not-required action drops to the bottom of _its own group_ without leaving it (groups stay contiguous, D1). Reading `stage` tolerates both doc shapes the engines feed in: the raw `status` array (`GetWorkflowOverview`, `GetEntityWorkflows`, `GetWorkflowActionGroupOverview` pass the action doc, where `status` is `[{ stage }]`) and the scalar the timeline's `$lookup` has already rewritten (`GetEventsTimeline.js:116`). Applied on **all four** surfaces.
- **Ungrouped actions** (`action_group: null`) → `groupIndex` not found → sort after all declared groups, matching `GetEntityWorkflows`' existing null-group bucket-last behavior.
- **Keyed actions** (multiple instances sharing a `type` → identical `(groupIndex, declIndex)`) → separated by their persisted `key` (`planActionTransition.js:145`), the field that distinguishes the instances. `key` is deterministic and stable across status changes, unlike the `created`/`updated.timestamp` tiebreak the engines apply today and unlike the random `_id`.
- **`_id` final fallback** — retained only as the last key so order is fully deterministic when two docs somehow share `(groupIndex, declIndex, key)` (e.g. both `key: null`); it never decides order for genuinely keyed actions.
- **Removed/unknown types** (a live action whose `type` is no longer in config) → sort last, deterministically.

### Worked example — demo onboarding

`onboarding.yaml` declares groups `[qualification, quoting, order, conversion]` and actions in the order `qualify, site-visit, send-quote, schedule-followup, upload-po, track-company-setup`.

| action              | group (index)     | decl index | key   | result order |
| ------------------- | ----------------- | ---------- | ----- | ------------ |
| qualify             | qualification (0) | 0          | (0,0) | 1            |
| site-visit          | quoting (1)       | 1          | (1,1) | 2            |
| send-quote          | quoting (1)       | 2          | (1,2) | 3            |
| schedule-followup   | quoting (1)       | 3          | (1,3) | 4            |
| upload-po           | order (2)         | 4          | (2,4) | 5            |
| track-company-setup | conversion (3)    | 5          | (3,5) | 6            |

Correct workflow order, with no `sort_order` anywhere. The per-group resets that make `sort_order`-alone fail today are irrelevant — `groupIndex` is the primary key.

### Engine changes

- **`GetEventsTimeline.js`** — remove the `$sortArray` stage (lines 180–189) and add `workflowsConfig` to the engine's context destructure (line 29 currently pulls only `{ params, mongoDb, connection }`; the value is on the context but unused here today). Sort each event's **`rawActions`** with the comparator **before** the enrichment loop (lines 239–276) — the trimmed cards built in that loop carry only `{ _id, kind, status, link, message, updated }` and drop `type`/`action_group`/`workflow_type`, so the comparator must run on the raw docs that still hold those fields. Drop `sort_order` from the emitted card shape (lines 258, 270) — it is vestigial. The comparator now also sinks `not-required` within each event group (D4); on the timeline that affects only rare "completed-then-deprecated" cards. (F12.)
- **`GetWorkflowOverview.js`** — replace the `(groupIndex, sort_order, _id)` sort (lines 77–89) with the comparator. Removes the bespoke `groupIndex` helper in favor of the shared one. **Behavior change:** this surface does not sink `not-required` today; the comparator now does (D4), bringing it in line with the others.
- **`GetEntityWorkflows.js`** — replace the whole `(not-required, sort_order, created.timestamp)` sort (lines 92–103) with the comparator; the `not-required` sink it applies today is now folded _into_ the comparator (D4), not composed ahead. Group-section iteration (line 107) is unchanged.
- **`GetWorkflowActionGroupOverview.js`** — same: replace the `(not-required, sort_order, created.timestamp)` sort with the comparator (D4).

### Retiring `sort_order`

- Remove `'sort_order'` from `ACTION_FIELDS` in `makeWorkflowsConfig.js:23` (and the `makeActionPages.js` list). `pick()` drops unknown fields, so configs that still declare `sort_order` are unaffected — it simply stops riding the config blob.
- Remove the `sort_order` row from `designs/workflows-module-concept/action-authoring/spec.md:190`.
- Strip `sort_order:` from the demo workflow configs (`apps/demo/.../onboarding/*.yaml`, `company-setup/*.yaml`) — cosmetic, since it is already a no-op.
- Update the engine tests that assert `sort_order` ordering. This is a fixture overhaul, not a one-line re-assert:
  - **`GetEventsTimeline.test.js`** — the "cards are sorted by `sort_order` ascending within an event" test currently seeds `workflowsConfig: []` and a `seedAction` helper that writes no `type`/`action_group`/`workflow_type`, so under the comparator every action resolves to `(∞, ∞, '')` and falls to the `_id` tiebreak — the existing `['a-first', 'a-second']` assertion passes purely lexically and would pass even if declaration order were broken. To genuinely exercise declaration order the fixture needs a **populated `workflowsConfig`** (with `action_groups[]` and `actions[]`) **and** `type`/`action_group`/`workflow_type` written onto seeded docs (extend `seedAction`).
  - **`GetEntityWorkflows.test.js:394`** and **`GetWorkflowActionGroupOverview.test.js:364`** — these seed `sort_order: 0/1` and assert "action-required comes first despite a higher `sort_order`." They keep passing (the `not-required` sink, now folded into the comparator, still orders ahead of declaration index; the assertion only checks status), but the `sort_order` framing is now misleading and should be reworked to assert against declaration order instead.
  - Add new coverage for cross-group ordering, ungrouped (null-group) actions, and keyed siblings (same `type`/group, distinct `key`).

## Files changed

| File                                                                                       | Change                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/.../connections/shared/render/compareActionOrder.js`                              | **New** — `makeWorkflowOrderComparator(workflowsConfig)`.                                                                                                                                                 |
| `plugins/.../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js`                           | Drop `$sortArray` sort_order stage; sort cards via comparator in JS; drop `sort_order` from card output.                                                                                                  |
| `plugins/.../WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js`                       | Replace bespoke `(groupIndex, sort_order, _id)` sort with comparator; this surface now also sinks `not-required` (D4).                                                                                    |
| `plugins/.../WorkflowAPI/GetEntityWorkflows/GetEntityWorkflows.js`                         | Comparator for within-group order; `not-required` sink now folded into the comparator (D4).                                                                                                               |
| `plugins/.../WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` | Same.                                                                                                                                                                                                     |
| `modules/workflows/resolvers/makeWorkflowsConfig.js`                                       | Remove `'sort_order'` from `ACTION_FIELDS`.                                                                                                                                                               |
| `modules/workflows/resolvers/makeActionPages.js`                                           | Remove `'sort_order'` from picked fields.                                                                                                                                                                 |
| `modules/workflows/README.md`                                                              | Remove `sort_order` from the line-85 list of action-level fields "the engine reads at runtime" — no longer true.                                                                                          |
| `designs/workflows-module-concept/action-authoring/spec.md`                                | Remove the `sort_order` field row (190); the field no longer qualifies as the prose's "opaque display metadata the engine treats..."; strip `sort_order:` from the example snippets (343, 378, 417, 446). |
| `designs/workflows-module-concept/action-authoring/design.md`                              | Remove the `sort_order` field-table row (275), rework the rationale paragraph (277) per the declaration-order divergence (see #6 / D1), and strip `sort_order:` from example snippets (310, 872).         |
| `modules/workflows/templates/view.yaml.njk`                                                | Drop `sort_order` from the line-5 `action_config` field-list comment (cosmetic; no template actually reads it).                                                                                           |
| `apps/demo/modules/workflows/workflow_config/**/*.yaml`                                    | Strip `sort_order:` lines (cosmetic).                                                                                                                                                                     |
| Engine `*.test.js` (4 engines)                                                             | Re-assert declaration order; add cross-group / ungrouped / keyed coverage.                                                                                                                                |

## Non-goals

- **No change to group-section rendering.** Surfaces that render grouped sections already iterate `action_groups` in declaration order; only the within-group action order changes.
- **No persisted ordering field.** Order stays a read-time, config-derived computation. This design explicitly removes the only persisted-order field rather than adding another.
- **No client-side ordering.** All ordering remains server-side in the engines.
- **No reference-app changes.** The reference app keeps its global-`sort_order` model; this design diverges deliberately.

## Relation to Part 51

This supersedes Part 51's **F12** ("timeline action order follows workflow order"), which scoped the fix to `GetEventsTimeline` alone. Investigation showed the same dead `sort_order` sort across all four read engines, so the fix is generalized here. F12 in `51-ui-fix-sweep/tasks-build.md` should point to this design. Part 51 **F15** (latest-at-top) is already done and is unaffected — the timeline still sorts events `date: -1`.
