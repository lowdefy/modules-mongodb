# Review 3 — Part 34 access-model absorption

Scope: review run after reconciling Part 38 with the finalized
[Part 34 — Action access model](../../34-action-access-model/design.md). Part 38
now declares itself Part 34's implementation vehicle (new "Implements Part 34" top
block, Proposed-change item 14, D16) for the five delegated decisions: the per-app
per-verb `access` shape + resolver validation, the per-verb `links` map (supersedes
Part 30's single `link`), signal→verb submit gating, the `visible_verbs` query
response, and the `workflow-` endpoint-id prefix. Verified against Part 34,
`state-machine.md`, the engine code under
`plugins/modules-mongodb-plugins/src/connections/`, the resolvers
(`makeActionPages.js`, `makeWorkflowApis.js`, `makeWorkflowsConfig.js`),
`api/stages/access_filter.yaml`, the demo `installation/install-step.yaml`, and the
Lowdefy build id-scoping (`lowdefy/packages/build/src/build/buildModules.js`).

**State of play.** The absorption is mechanically complete — no stale single-`link`,
`access.roles`, verb-array-shorthand, or "no edits needed" references survive
(`grep` confirms the remaining mentions are all "supersedes / rejects" framing). The
architecture holds. The findings below are: **one verified factual error in the
cited Part 34 contract** (the `workflow-` glob rationale), **two under-specified
semantics that change which workflow states are reachable**, and a cluster of
scope/consistency gaps. Several findings trace back to **Part 34** (the source of
truth); per CLAUDE.md they should be fixed there first, with Part 38 following.

## Correctness / consistency

### 1. The `workflow-` prefix does not deliver D10's glob rationale — emitted ids are entry-scoped

> **Resolved.** Confirmed the factual claim (Lowdefy `buildModules.js` prepends `${entry.id}/` to every page id (`:87`) and endpoint id (`:102`)), then **dropped the `workflow-` prefix from derived endpoints entirely** rather than re-justifying it — entry scoping (`{entry_id}/…`) already namespaces them, and the proposed prefix produced redundant `workflows/workflow-…` doubling. Derived per-workflow pages/Apis stay `{workflow_type}-{action_type}-…`; the three globs are `{entry_id}/*` (all), `{entry_id}/{type}-*` (per-type), and `{entry_id}/workflow-*` (fixed module pages). The `workflow-` prefix is **inverted onto the module's fixed pages**: `simple-view/edit/review` → `workflow-simple-*`, `group-overview` → `workflow-group-overview` (`workflow-overview` already conformant), reserving `workflow-*` for module infrastructure. `workflow` becomes a reserved workflow-type name. Rewrote Part 34 D10 (full rationale + naming tables), D11 globs, D7 link table/shape, and the Part 12/13/17/25 Touches rows; mirrored in Part 38 (proposed-change items 5 & 14, D16 emitted-id-naming paragraph, Files-changed for `makeActionPages`/`makeWorkflowApis`/fixed-page renames, worked example, resolver test). Nav pages keep descriptive names (`workflow-overview`/`workflow-group-overview`) over bare verbs since the module has multiple view scopes.

Part 34 D10 justifies adding the literal `workflow-` prefix to emitted page/Api ids
so app-level role globs slice cleanly:

> ```yaml
> api:
>   roles:
>     sales-rep:
>       - workflow-qualification-* # any endpoint for this workflow
>     sales-manager:
>       - workflow-qualification-approve-* # just the approve action
> ```
>
> … per-workflow slicing is just `workflow-{type}-*`.

and (D10 close) "a single role rule against `workflow-*` cleanly scopes to workflow
endpoints across both Apis and pages."

The Lowdefy build prepends the **module entry id** to every emitted page and
endpoint id:

> `buildModules.js:87` — `page.id = \`${entry.id}/${page.id}\`;`
`buildModules.js:102`—`endpoint.id = \`${entry.id}/${endpoint.id}\`;`

So the real id is `{entryId}/workflow-{type}-{action}-{verb}`, not
`workflow-{type}-{action}-{verb}`. The central-auth globs in D10/D11 therefore won't
match as written — an app author must write `{entryId}/workflow-qualification-*` (or
`*/workflow-…`). And because the entry id _already_ namespaces every workflow page,
the prefix's stated cross-app benefit ("per-workflow globs don't accidentally match
unrelated app pages that happen to share the workflow type name") is largely already
provided by entry scoping; the `workflow-` literal's remaining real value is
disambiguating action pages from the module's _other_ pages within the same entry
(`workflow-overview`, entity pages).

Note the **engine side is fine**: `computeEngineLinks` learns its entry id from the
`entry_id` connection field (Part 30 / Part 38 D14, D16) and builds correctly-scoped
`pageId`s. This finding is only about the _auth-config glob examples_ being
inaccurate, and about the prefix's rationale being overstated.

**Fix.** In Part 34 D10 and D11, correct every glob example to include the mandatory
`{entryId}/` scope segment (e.g. `{entryId}/workflow-qualification-*`), and rewrite
the "single rule against `workflow-*`" sentence to acknowledge entry scoping. Either
re-justify the `workflow-` prefix on its real (intra-entry disambiguation) merit, or
reconsider whether it earns its keep now that entry scoping is confirmed. Mirror the
correction in Part 38 D16's "`workflow-` endpoint prefix" paragraph. This is a
factual error in the source design; designs are the source of truth.

### 2. Which app's `review` verb decides `submit` → `in-review` vs `done`?

> **Resolved.** Pinned the split as an **action-global** property: `submit` lands `in-review` iff _any_ app's `access` declares the `review` verb, computed live from the static `actionConfig` via `hasReview` (presence-only, role values and submitting app ignored) — equivalently "a review page is emitted" since Part 34 D5 emits it from the same verb key. Corrected the per-app `access.{app_name}` phrasing in Part 34 D6 (source of truth, new paragraph), Part 38 D4 (`resolveSignal` comment + `hasReview` definition), and the worked example (lines on `install-step`). Added a multi-app integration test (review declared in one app, absent in another; both submits land `in-review`). Live-vs-frozen read settled as **live** — the only motivation to freeze (protect in-flight actions from config edits) is out of scope per the module's V1 migration stance (see #3).

The `submit` resolution is the one FSM cell that reads `access`:

> Part 38 D4: "`submit` picks in-review vs done from the action's static
> `access.{app_name}` review verb (nullary — no payload input)."
> Part 34 D6: signal table; the in-review/done split keys on the review verb.

The action's landing stage is **shared** state (one action doc, all apps see the
same `status[0].stage`), but the phrasing is **per-app** (`access.{app_name}`). For
a multi-app action where `team-app` declares `review` and `support-app` does not,
"the submitting app's review verb" yields _different terminal behaviour for the same
action depending on who submits it_ — a `team-app` submit lands `in-review`, a
`support-app` submit lands `done`. That is almost certainly wrong: the existence of
a review step is a property of the action, not of the submitter.

Part 38's own `resolveSignal` signature is evidence the intended rule is
app-agnostic — it takes no `currentApp`:

> Files changed: "`resolveSignal.js` — the `(action, signal, payload, actionConfig)
→ targetStage | null` function."

To inspect "does this action have a review step," the function must read
`actionConfig.access` across **all** apps (i.e. "any app declares `review`"), since
it has no app to scope to. But this is never stated, and it contradicts the per-app
`access.{app_name}` phrasing in D4/D6. The demo has a single app (`demo`), so the
ambiguity never surfaces in the in-tree tests.

**Fix.** Pin the semantic explicitly in Part 34 D6 (and the Part 38 D4 comment +
worked example): the `submit` → in-review/done split is decided by whether **any**
app's `access` declares the `review` verb for the action — an action-global
property, not the submitting app's view. Add an integration test with a multi-app
action (review declared in one app, absent in another) asserting both submits land
the same stage.

### 3. `access` config now drives FSM transitions, not just visibility — a live-edit hazard

> **Resolved.** Documented as a known V1 limitation in Part 34 D6 (source of truth) and referenced from Part 38 D16: verb _presence_ drives both the FSM split (D4) and page/link emission, so editing `access` on a deployed workflow can reshape reachable states and strand in-flight actions, with no engine remediation. Rather than add a config-change migration guard or denormalize the FSM flag onto the action doc, this is folded into the module's existing V1 migration stance — no version actions; an author who edits access on a live workflow owns any required data migration. This also settled #2's live-vs-frozen read in favour of **live** (freezing would be robustness for a hazard the module has deliberately scoped out).

Finding 2 means the _presence_ of a `review` verb determines which stages are
reachable (`in-review` exists iff a review step exists). So `access` is no longer
purely a gate over a fixed state graph — editing it reshapes the state machine. The
concrete hazard: remove the `review` verb from a deployed workflow and any action
currently sitting at `in-review` has (a) no review page emitted by `makeActionPages`
(the verb key is gone), (b) no review gate, and (c) `computeEngineLinks` writes
`links.review = null` (Part 34 D7: "verbs the slug doesn't declare … get `null`").
The action is stranded — no affordance to advance past `in-review`.

This isn't hypothetical for long-lived workflows: access lists get edited as teams
reorganize. Nothing in Part 34 or Part 38 flags that an access edit can change
reachable states or strand in-flight actions.

**Fix.** Document the constraint (Part 34, near D6/D7; referenced from Part 38 D16):
a verb that gates a reachable stage is part of the workflow's operational contract —
removing it while actions are mid-flight at that stage strands them, and there is no
engine remediation. State this as a known v1 limitation (consistent with the Q3
"sticky display for slugs leaving access" stance) or add an open question on whether
a config-change migration guard is wanted.

## Moderate

### 4. Role-gate evaluation is now reimplemented in three runtimes

> **Resolved.** Added a **shared role-gate oracle** to the test strategy: a single `gates.fixtures.js` table of `(gate, user-roles) → bool` cases (`true` always passes; array intersection; empty intersection / undeclared verb / empty user-roles all fail) against which all three implementations — the `visible_verbs_filter` aggregation (run through `mongodb-memory-server`), the submit-time load-phase JS, and the `action_role_check` client helper — are tested, so any divergence fails CI. This is the drift-prevention mechanism standing in for the code-sharing the three runtimes preclude.

The `true | [roles]` intersection against `_user.apps.{app}.roles` is evaluated in
three independent places, all landing in this part:

- **Query-time** — `visible_verbs_filter.yaml`, MongoDB aggregation `$let`/`$or`
  (Part 34 D12).
- **Submit-time** — the load-phase access check, JS (Part 38 D2, D16).
- **Client** — `action_role_check`, Lowdefy operators/`_js` populating per-verb
  `_state.action_allowed` (Part 34 D8, Part 38 D16).

They run in three runtimes and genuinely can't share code, but they encode one
semantic. A future change (e.g. a wildcard/`*` role, or "deny" lists) means editing
three implementations in lockstep — exactly the convention-not-mechanism drift
CLAUDE.md "One correct way" warns against. The aggregation form is also the most
error-prone (hand-written `$setIntersection`/`$or`) and the hardest to unit-test.

**Fix.** Can't unify the runtimes, so pin the semantic with a **single shared set of
test fixtures** (gate × user-roles → expected bool) that all three implementations
are tested against, so divergence fails CI. Note this explicitly in Part 38's test
strategy (currently the three are tested separately with no shared oracle).

### 5. Part 38 has quietly become two parts (engine write-path + access read/build/client surfaces)

> **Resolved.** Kept as one design (the write-path-coupled access work — submit-time gate in the load phase, per-verb `links` map in the plan phase — genuinely shares the rebuild's surface, and splitting it into a separate part re-introduces the sequencing churn the FSM+load-plan-commit combination deliberately avoided). Resolved the review's "at minimum" recommendation: added a **tasking note** to D16 declaring the access-model work an independent task cluster, with the three engine-independent surfaces (`visible_verbs_filter`, `validateActionAccess`, `action_role_check`) called out as buildable/reviewable without the rebuild core, and `action_role_check` flagged as where Part 18's amend-via-note actually lands. The mechanical split happens at `r:design-task`.

The load-plan-commit rebuild is the engine **write** path. The Part 34 absorption
adds work that doesn't touch the FSM or load-plan-commit at all:

- `visible_verbs_filter.yaml` — a **read**-path aggregation (in `get-entity-workflows`
  et al.).
- `validateActionAccess` — **build-time** resolver validation.
- `action_role_check` + per-verb page-template reads — **client** Lowdefy YAML.

These are orthogonal to the engine rebuild and span three different skill areas
(plugin JS, MongoDB aggregation, Lowdefy page YAML) inside one already-XL part. That
inflates the review surface and couples unrelated risk. The `action_role_check`
change also amends a `_completed` part (Part 18), which Part 34's Touches table
lists as amend-via-note — but Part 38 now _implements_ it.

**Fix.** Decide whether the Part 34 absorption should be its own part (or a cleanly
separable task cluster) sequenced alongside the engine rebuild, rather than folded
into it. At minimum, group the access-model work as its own task block in tasking so
it can be built/reviewed independently of the load-plan-commit core. (This connects
to the open scope question already raised with the author about `action_role_check`.)

### 6. `notification_roles` moved to the action root, but the extractor is not in Files-changed

> **Deferred to Part 41 (new stub) + premise corrected.** The review's mechanism is wrong twice: `getActionFields.js` reads **no** `notification_roles` (it's a fixed field projection), and grep confirms `notification_roles` is consumed **nowhere** in plugin `src`, resolvers, or demo — the engine event path (`buildDefaultLogEventPayload` → `dispatchLogEvent` → `dispatchNotifications`) does not propagate it onto the event; `dispatchNotifications` passes only `event_ids` and the app's `send_routine` re-fetches the event. The reference implementation reportedly wrote it onto the event, but this module never did, so there's no one-line extractor to add — restoring/redesigning the consumer is a real piece of work. Per author decision, the whole `notification_roles` model is a **rethink**, captured in a new stub [Part 41 — Notification-roles model](../41-notification-roles-model/design.md). Minimal changes only to keep this (bloated) design lean: struck Part 34 Q3's false `getActionFields.js:14` claim and pointed it at Part 41; added a Part 38 Non-goal scoping `notification_roles` wiring out to Part 41.

Part 34 D9 moves `notification_roles` from under `access:` to the action root, and
its Q3 notes the consumer:

> Part 34 Q3: "`getActionFields.js:14` already reads `config.access?.notification_roles`
> directly, so the extractor change is one line."

After the move, that read becomes `config.notification_roles`. Part 38 mentions the
root placement in D16 but lists neither `getActionFields.js` nor `planNotifications`
in its "Files changed" — so the one-line extractor change has no home in the task
list, and `planNotifications` (which consumes the fan-out list) isn't flagged.

**Fix.** Add `getActionFields.js` (extractor: `access.notification_roles` →
`notification_roles`) to Part 38's Files-changed, and confirm `planNotifications.js`
reads the root field. Small, but it's exactly the kind of dangling consumer that
silently breaks notifications.

### 7. No data backfill specified for in-flight action docs

> **Resolved.** Added an explicit Non-goal to Part 38: no in-flight action-doc backfill (old singular `<slug>.link` + stale `pageId`s aren't migrated), justified by the greenfield assumption (no shipped workflows) and consistent with the V1 migration stance from #3 (author owns any data migration on live docs). Verified the demo ships **no** seed/fixture files — action docs are created at runtime by starting a workflow — so there's nothing to backfill there; a developer with stale local docs just re-runs the workflow.

The rebuilt engine reads `<slug>.links` (plural map); pre-migration action docs
carry `<slug>.link` (singular), and page ids change under the `workflow-` prefix. An
action that never transitions again keeps its old shape — display surfaces read
`.links`, find nothing, and render no link. Part 38's demo migration strips authored
`link:` from _config cells_ but specifies no backfill of existing _action docs_.

This is acceptable **only** because there are no shipped workflows (Part 34 leans on
this too), but Part 38 leaves the assumption implicit. If any environment (even a
demo seed) has live action docs, they'll silently lose link affordances.

**Fix.** State explicitly in Part 38 (Schema additions or Non-goals) that no
in-flight action-doc backfill is provided, justified by the greenfield assumption.
If the demo seeds action docs, add a one-off migration or re-seed step to the demo
migration task.

## Minor

### 8. Silent runtime invisibility when `edit` is declared without `view`

> **Accepted.** This is intended behaviour, not a footgun: a user with no `view` (and no other true verb) has no declared access to the action, so dropping it from `actions-on-entity` and the event timeline is correct. A user with `edit` still sees it (`edit` makes `$anyElementTrue` true); only users with no access at all lose it — by design. The existing D4 lint-warn already nudges the genuinely-accidental "forgot `view` for my editors" case. No design change (annotation-only).

`visible_verbs_filter.yaml` drops an action when no verb is true for the user
(Part 34 D12, `$match $anyElementTrue`). Combined with independent verbs (Part 34
D4) and the lint-warn-not-error on `edit`/`review`/`error` without `view`, an author
who writes `edit: [manager]` and forgets `view` makes the action **invisible** to
every non-manager (no read-only fallback). The only guard is a build-time
_warning_.

**Fix.** No schema change needed (the independence is deliberate, D4), but ensure
the lint warning is prominent / hard to miss, and call out this failure mode in the
Part 34 D4 rationale so authors understand "edit without view = invisible to
everyone else," not just "you probably forgot view."

### 9. (Positive — make it intended) Access check before pre-hook side effects

> **Resolved.** Added a one-sentence intentional-property note to D2's load-phase access-check description: the check sits ahead of the pre-hook on purpose, so an unauthorized submit is rejected before any pre-hook fires and unauthorized users never trigger pre-hook external side effects — with an explicit "do not move the check after the pre-hook" so a future refactor can't quietly regress it.

Putting the per-verb access check in the **load** phase (Part 38 D2) means an
unauthorized submit is rejected _before_ the pre-hook fires — so unauthorized users
never trigger pre-hook external side effects (callApi, third-party writes). This is a
genuinely good consequence of the phase ordering, currently implicit.

**Fix.** State it as an intended property in D2/D16 (one sentence) so a future
refactor doesn't move the check after the pre-hook and quietly regress it.

## What checks out (verified this pass)

- The absorption is textually clean: no surviving single-`link`, `access.roles`,
  verb-array-shorthand, or "get-entity-workflows needs no edits" references (grep).
- `makeActionPages.js:43` confirms the _current_ code reads `access.{app}` as a verb
  **array** (`accessVerbs.includes(v)`) and emits un-prefixed ids — i.e. Part 38's
  "read map keys + `workflow-` prefix" change is real work, correctly scoped.
- `access_filter.yaml` confirms the _current_ filter reads the removed action-wide
  `access.roles` and the `[view, edit, review]` shorthand — so the
  `visible_verbs_filter.yaml` replacement is genuinely required, not cosmetic.
- The demo `install-step.yaml` carries the old `access.demo: { roles, verbs }` shape,
  matching Part 38's corrected migration line.
- The per-verb `links` map and UI priority `edit > review > error > view` are
  internally consistent with the engine nulling the irrelevant cell per stage
  (Part 34 D7) — no stale "compound cell" table remains in Part 38.
- D16 correctly keeps role gates _out_ of `computeEngineLinks` (links are computed
  for all declared verbs; the UI filters via `visible_verbs`) — consistent with
  Part 34 D7.
