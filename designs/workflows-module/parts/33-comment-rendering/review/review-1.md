# Review 1 — Merge-order correctness and the file-change list

Verified the design's code claims against source. The core idea is sound and most
factual claims check out: `dispatchLogEvent.js:66` does gate `metadata.comment` on
`typeof comment === "string"` (so object comments are dropped today — the latent bug
is real); `EventsTimeline.js:284-287` renders `sanitize(event.description)` via
`dangerouslySetInnerHTML` inside the always-present `EventDescription` card;
`events-timeline.yaml:43-50` maps `display.{display_key}.description → description`;
and `new-event.yaml:10-12` spreads `_payload: display` and `_payload: references`
to the **top level** via `_object.assign`, so D6's `reference_field: action_ids`
filter and the comment render path are both correct (`doc.{app_name}.description`,
`doc.action_ids`). The findings below are the gaps.

## Correctness

### 1. D4's "static description survives and renders" is not supported by the current merge/storage code

> **Resolved.** Re-based on [Part 38](../../_completed/38-engine-rebuild/design.md)'s engine-rendered event-display model (plain Nunjucks strings, three-layer merge at plan time), which Part 33 sits on top of — so the `_nunjucks`-operator default and the shallow-merge code this finding critiques are mostly superseded by Part 38. The one surviving gap (Part 38 carries the shallow `display` merge over unchanged) is fixed here: new **D7** adds a **deep-merge under the app key** so the engine title + a per-app author override + the comment coexist; **D4** rewritten to state per-field precedence (author title > engine generic; comment > author static description) via *merge, then fold-comment-last*. Multi-app per-app overrides — `event.{interaction}.display.{app}.{title,description}` as engine-rendered Nunjucks strings — pinned in D7 and `submit-pipeline/spec.md` § Default log event. Background, Files-changed, In-scope and Verification updated. The deep-merge is owned by this part (lands after Part 38). The `detail`-vs-`description` field-name slip is a Part 38 doc error (separate) and is being fixed there.

D4 and the Verification section claim: with no comment, a static
`event.{interaction}.display.description` override "survives" and renders, while a
runtime comment overwrites it. Neither half holds against the code:

- **The override `display` channel is free-form and not app-keyed.** Authors write
  `action.event.{interaction}.display`, baked verbatim by `emitEventOverrides`
  (`makeWorkflowApis.js:39-52`, `EVENT_OVERRIDE_FIELDS` includes `display`). The
  worked-example test bakes it as a **bare string** — `display: "Lead qualified"`
  (`makeWorkflowApis.test.js:158`) — not `{ {app_name}: { description } }`.
- **`mergeEventOverrides` merges only one level deep at the `display` top level**
  (`mergeEventOverrides.js:28-31`: `{ ...base.display, ...override.display }`). So:
  - If the author writes `display: { {app_name}: { description: "…" } }`, the shallow
    merge **replaces the entire `{app_name}` bucket**, dropping the engine's
    auto-`title`. The headline title D1 relies on is lost.
  - If the author writes `display: { description: "…" }` (no app key — the shape D4's
    prose literally shows), it lands at `doc.description`, a sibling of
    `doc.{app_name}`. The timeline reads `$ {display_key}.description` =
    `$ {app_name}.description`, so the static description **never renders**.
  - Spreading the worked-example **string** into `display` yields character-indexed
    keys (`{0:'L',1:'e',…}`) — already broken, independent of this part.

  This also taints the comment path: when an app-keyed display override exists,
  `mergeEventOverrides` has already dropped `title` *before* `foldCommentIntoEvent`
  runs, so the comment renders but the title is gone.

  **Fix:** pin the exact author shape for a static description and make
  `mergeEventOverrides` deep-merge under the app key (two levels:
  `display → {app_name} → {title,description,…}`) so title + static description
  coexist — and add a unit test for it. Or, if that coexistence isn't actually needed
  for any case that exists, drop the "static description survives/renders" claim from
  D4 and Verification and scope it out. Don't ship the claim on an unverified merge
  assumption.

### 2. `foldCommentIntoEvent`'s call site is `handleSubmit.js`, which the Files-changed list omits

> **Resolved.** Re-based on [Part 38](../../_completed/38-engine-rebuild/design.md)'s architecture, which deletes `handleSubmit.js` and consolidates event assembly into the shared `planEventDispatch` planner — so neither review option (a/b) applies, and there's no `handleSubmit.js:317-334` orchestration step to thread the comment through. The fold's call site is pinned to that planner (after the deep-merge), and Files-changed now carries a single "Event-dispatch planner" bullet replacing the old `dispatchLogEvent.js` / `mergeEventOverrides.js` entries. Background, D3, and Contract-to-neighbours were also updated off their pre-Part-38 file references (per the broader "fix other pre-38 discrepancies" sweep).

D4 says the helper runs "after `mergeEventOverrides`," and the Files-changed bullet
for `dispatchLogEvent.js` says "**the handler** calls `foldCommentIntoEvent` after
`mergeEventOverrides`." But the orchestration that sequences
`buildDefaultLogEventPayload → mergeEventOverrides → dispatchLogEvent` lives in
`handleSubmit.js:317-334`, which is **not** in the Files-changed list. Inserting the
post-merge fold (and threading `comment` + `app_name` to the new call site) is an edit
to `handleSubmit.js`. Today `handleSubmit.js:327` passes `comment` into
`buildDefaultLogEventPayload`; once that stops consuming it, the value must be routed
to the fold instead.

**Fix:** either (a) add `handleSubmit.js` to Files-changed and specify the step-7 edit
explicitly:
```
const merged = mergeEventOverrides({ defaultPayload, yamlOverride, preHookOverride });
const folded = foldCommentIntoEvent(merged, logEventInputBag.comment, context.connection?.app_name);
await dispatchLogEvent(context, folded);
```
or (b) move the fold **inside** `dispatchLogEvent.js` (it already has `context.params.comment`
and `context.connection.app_name`), which keeps the change confined to the two files
the list already names. Pick one and make the list match.

## Test impact

### 3. Existing `dispatchLogEvent.test.js` comment tests assert `metadata.comment` and must be rewritten

> **Resolved.** Added a "Test migration" note to Verification and a pointer in the event-dispatch-planner Files-changed bullet: any pre-existing `metadata.comment` assertion (pre-Part-38, the four `dispatchLogEvent.test.js` cases) is removed or migrated onto `display.{app_name}.description`, so no `metadata.comment` assertions remain.

`dispatchLogEvent.test.js:127-144` has four live tests asserting
`result.metadata.comment` is set/omitted by `buildDefaultLogEventPayload`. Dropping the
`metadata.comment` write (D2) makes all four fail. The Verification section lists *new*
`foldCommentIntoEvent` unit tests but never says these existing tests are deleted or
moved onto the helper. Call it out so the implementer doesn't leave a broken suite.

## Minor

### 4. `foldCommentIntoEvent` should defensively ensure the `display[appName]` bucket exists

> **Resolved.** Folded into #1. `foldCommentIntoEvent` now ensures the bucket exists (`display[appName] ??= {}`) before writing, with a unit case for the missing-bucket scenario (D3, Verification).

D3 says the helper "sets `display[appName].description`." In the submit path the bucket
always exists (engine default writes `title`). But a pre-hook `event_overrides.display`
could replace the whole `display` object (finding 1), leaving `display[appName]`
undefined when the helper runs post-merge — `display[appName].description = …` would
throw. Have the helper create the bucket if missing (`display[appName] ??= {}`), and
add that to its unit cases.

### 5. D4 mislabels the static-description channel as "Part 32 Layer 2"

> **Resolved.** Folded into #1. D4 rewritten: the static-description channel is the `event.{interaction}.display` override baked by Part 13's `emitEventOverrides`, **not** "Part 32 Layer 2" (Part 32 dropped the static *status* layer, a different mechanism).

Part 32 ("drop static overrides") removed the static **status** layer
(`interactions.{interaction}.status`) — its "Layer 2" was status, not display
(`_completed/32-drop-static-overrides/design.md:11`). The display override D4 means is
the separate, still-live `event.{interaction}.display` channel baked by Part 13's
`emitEventOverrides`. Fix the cross-reference so it points at the right mechanism.

### 6. D6 relies on `events.display_key == workflows.app_name` — worth stating

> **Resolved.** Added a "Dependency" paragraph to D6 stating the `events.display_key == workflows.app_name` invariant (and noting it's already standing — it's why workflow events surface on the entity-page timeline today), so a misconfigured app understands why its action-page timeline would be empty.

The `events-timeline` component reads `display_key` defaulting to the **events** module
entry's `_module.var: display_key` (`events-timeline.yaml:27-31`), while the engine keys
the comment under the **workflows** entry's `app_name`. Rendering on `simple-view`
therefore requires the app to wire `events.display_key == workflows.app_name`. This is
already an invariant (workflow events surface on entity-page timelines today, per the
design's own Background §line 20), so it's not a blocker — but D6 should note the
dependency so an app that mismatches them doesn't get a silently empty timeline.
