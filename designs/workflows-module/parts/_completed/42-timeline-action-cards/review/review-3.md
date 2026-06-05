# Review 3 — Splice mechanism & design-vs-shipped drift

Verified the design against the now-partially-shipped Part 38 code (`modules/shared/workflow/visible_verbs.yaml`, `api/stages/visible_verbs_filter.yaml`, the three read APIs), the live `events-timeline.yaml`, `EventsTimeline.js`, the `action_statuses` enum, and the Part 42 task files. The core architecture (one shared de-dup fragment, two consumers, server-side access-aware link resolution) verifies cleanly against the Part 38 contract, and the de-dup fragment in task 5 is internally coherent. Two findings concern the **design document as source of truth** diverging from what will actually build / what already shipped — both already correctly handled in the task files, but the design (which the project treats as the source of truth) still shows the broken/stale shape.

## Correctness

### 1. The proposed-shape sketches splice a multi-stage fragment via a bare `- _ref:` — this nests, it does not flatten, and will not build

The design's "Proposed shape" splices `timeline_action_lookup.yaml` into `events-timeline.yaml` as a single bare list element (design.md:144-149):

```yaml
pipeline:
  - $match: { ... }
  - _ref:                                 # NEW — always spliced
      path: ../shared/workflow/timeline_action_lookup.yaml
      vars: { app_name: ... }
  - $addFields: { ... }                   # D6 filter
  - $sort: { date: -1 }
```

and the app-developer re-export example does the same (design.md:184-191, `- _ref: { module: workflows, component: timeline-action-lookup }` between `$match` and `$facet`).

But `timeline_action_lookup.yaml` is a **multi-stage YAML sequence** (`$lookup` → `$unwind` → `$setWindowFields` → `$group` → … — see task 5). Lowdefy `_ref` substitutes a node *in place* and does **not** splice a list into the parent array — a list-valued `_ref` placed as one pipeline element nests, producing `[ $match, [ …8 fragment stages… ], $addFields, $sort ]`, which is an invalid pipeline. This is not speculative: it is exactly the behaviour the repo's own shared stages are built around — `visible_verbs.yaml:18-21` and `visible_verbs_filter.yaml:8-11` both keep themselves to a *single* `$addFields`/`$match` precisely because "a two-stage list `_ref`'d mid-pipeline would nest, not flatten." A multi-stage fragment cannot be one of those single-node refs.

The fragment must be spliced with `_build.array.concat` (the operator the contacts/layout modules already use for exactly this — e.g. `modules/contacts/requests/get_contact.yaml:16`). Task 5 (Notes, lines 188-195) and task 7 already caught this and prescribe `_build.array.concat`; the **design's proposed-shape sketches were never corrected** and still show the nesting form in both places.

This also softens **D1**'s re-export ergonomics claim (design.md:34, "a clean `_ref: { module: workflows, component: timeline-action-lookup }` handle for custom pipelines"). It is not a drop-in pipeline element — the developer must wrap their pipeline in `_build.array.concat` and pass the fragment ref as one array element. The re-export's value stands, but the "clean `_ref`" framing understates the splice mechanics the consumer must know.

**Fix:** Rewrite the `events-timeline.yaml` edit sketch and the app-developer example to use `_build.array.concat` (matching task 5/7), and adjust D1's re-export prose to state the fragment is spliced via `_build.array.concat`, not a bare `_ref`.

## Design vs. shipped code

### 2. `visible_verbs.yaml` is listed as **New** and framed as factored-out *by this part* — but Part 38 already shipped it, and the real delta is a `_module.var` → `_var` re-parameterization that ripples to three existing callers

The Files-changed table (design.md:198) marks `modules/shared/workflow/visible_verbs.yaml` as **New**, and D5 (design.md:85) frames the factoring as Part 42 work ("This is the *compute* half of Part 38's `visible_verbs_filter.yaml`, factored out … Part 38's `visible_verbs_filter.yaml` becomes this stage + its `$match` drop"). On disk, Part 38 has **already** done that factoring: `modules/shared/workflow/visible_verbs.yaml` exists as the standalone compute stage, and `get-entity-workflows.yaml:34`, `get-workflow-overview.yaml:52`, `get-action-group-overview.yaml:28` already `_ref` it.

The shipped stage reads the app name via `_module.var: app_name` (visible_verbs.yaml:35, 69, 103, 137). Part 42's *actual* change — correctly identified only in task 2 — is to **re-parameterize** it to `_var: app_name` so the dependency-free events module (which has no `app_name` var, only `display_key`) can supply it via `_ref` vars. That conversion is not cost-free: it forces all **three existing callers** to switch from a bare `_ref` to `_ref … vars: { app_name: { _module.var: app_name } }`, or `_var: app_name` resolves to nothing and every action's access gate silently breaks.

Per the project's "designs are the source of truth" rule, the design should reflect reality:
- Reclassify `visible_verbs.yaml` from **New** to **Modify** (re-parameterize `_module.var: app_name` → `_var: app_name`).
- Add the three read APIs' `visible_verbs` `_ref`-call update (bare → `vars: { app_name }`) to the Files-changed table — currently only the `resolve_action_link` adoption is listed for those APIs (design.md:200), but they also need the `app_name` var threaded for finding #2's parameterization.
- Adjust D5's "factored out" wording to "re-parameterized" (Part 38 owns the factoring; Part 42 owns making it consumer-supplied).

Task 2 already documents this as a "Deviation from the design's Files table" — that note belongs back-propagated into the design itself.

## Minor

### 3. On an action-keyed timeline, a co-referenced action's card attaches to the latest *matched* event, not its true latest event

D6 correctly strips the timeline's own action card. But the fragment runs *after* the reference `$match`, so its "latest referencing event" partition is scoped to the matched subset (D4 acknowledges this scoping, and it's correct for entity timelines). On the Part 33 action-view-page timeline (`reference_field: action_ids`, `reference_value: this action`), an event that references *both* this action and another action B will surface B's card — attached to the latest *this-action-referencing* event, which need not be B's globally-latest event. The card is for a related action so it's arguably fine, but the attachment point can be slightly off. v0 had the same property; worth a one-line acknowledgement in D6 that the "latest event" scoping interacts with multi-action events on a single-action timeline, or an explicit statement that this is accepted.

### 4. Confirm the workflows manifest has an `exports:` block to extend

Task 5 (lines 165-167) flags that `modules/workflows/module.lowdefy.yaml` "currently has no `exports:` block — confirm and add one." A quick scan shows a top-level `components:` key but no `exports:`. The design's re-export sketch (design.md:171-175) assumes `exports.components` exists to append to. Not a blocker — just confirm whether the export needs a new `exports:` block created (it appears it does) so the manifest stays valid.

## Confirmed accurate against shipped code

- **Link contract.** Part 38 design (lines 361, 408, 766) confirms the per-verb `links: { view, edit, review, error }` map with each cell a `{ pageId, urlQuery, title }` link object or `null`; `resolve_action_link.yaml`'s `$ne: [$$v.<verb>, null]` non-null check (D5 sketch) is the right state test, and a missing key also evaluates as `null` in `$ne`, so the four-key assumption is safe either way.
- **`visible_verbs` resolution.** The shipped `visible_verbs.yaml` resolves each verb as `gate === true OR (gate ∩ user_roles) non-empty`, defaulting absent gates to `[]` (false) — exactly the access semantics D5 relies on for the priority pick.
- **Block colour-key reconcile (D3).** `EventAction` reads `statusConf.card_color` / `border_color` / `color` / `title` (EventsTimeline.js:372-374, 387, 392) and the link as a single `action.link` with `pageId`/`urlQuery`/`title` (EventsTimeline.js:364, 399-417); the enum carries `color` / `borderColor` / `titleColor` / `title`. The D3 remap table is correct against current code.
- **Override-merge symmetry (D3).** `event_types` is `type: object, default: {}` in the events manifest and merged via `_build.object.assign: [ _ref shared enum, _module.var: event_types ]` (events-timeline.yaml:84-87); the proposed `action_statuses_display` var + merge mirrors it exactly. The var is confirmed absent today, so it does need adding.
- **De-dup fragment (task 5).** `$setWindowFields` (partition `actions._id`, sort `created.timestamp` asc, `$last` over `[current, unbounded]`) → `$group` keep-on-last → null-filter → `$sortArray` → `$replaceRoot` → `$project { last_event_id: 0 }` is internally coherent; `last_event_id` survives `$group`'s `$first: $$ROOT` and is correctly projected out post-`$replaceRoot`. Action-free events (preserved by `$unwind`) push only `null` and render no card.
- **Join field.** `action_ids` top-level on event docs — verified accurate by prior reviews and unchanged by Part 38.
