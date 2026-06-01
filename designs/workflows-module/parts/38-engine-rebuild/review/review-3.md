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

Part 34 D10 justifies adding the literal `workflow-` prefix to emitted page/Api ids
so app-level role globs slice cleanly:

> ```yaml
> api:
>   roles:
>     sales-rep:
>       - workflow-qualification-*           # any endpoint for this workflow
>     sales-manager:
>       - workflow-qualification-approve-*   # just the approve action
> ```
> … per-workflow slicing is just `workflow-{type}-*`.

and (D10 close) "a single role rule against `workflow-*` cleanly scopes to workflow
endpoints across both Apis and pages."

The Lowdefy build prepends the **module entry id** to every emitted page and
endpoint id:

> `buildModules.js:87` — `page.id = \`${entry.id}/${page.id}\`;`
> `buildModules.js:102` — `endpoint.id = \`${entry.id}/${endpoint.id}\`;`

So the real id is `{entryId}/workflow-{type}-{action}-{verb}`, not
`workflow-{type}-{action}-{verb}`. The central-auth globs in D10/D11 therefore won't
match as written — an app author must write `{entryId}/workflow-qualification-*` (or
`*/workflow-…`). And because the entry id *already* namespaces every workflow page,
the prefix's stated cross-app benefit ("per-workflow globs don't accidentally match
unrelated app pages that happen to share the workflow type name") is largely already
provided by entry scoping; the `workflow-` literal's remaining real value is
disambiguating action pages from the module's *other* pages within the same entry
(`workflow-overview`, entity pages).

Note the **engine side is fine**: `computeEngineLinks` learns its entry id from the
`entry_id` connection field (Part 30 / Part 38 D14, D16) and builds correctly-scoped
`pageId`s. This finding is only about the *auth-config glob examples* being
inaccurate, and about the prefix's rationale being overstated.

**Fix.** In Part 34 D10 and D11, correct every glob example to include the mandatory
`{entryId}/` scope segment (e.g. `{entryId}/workflow-qualification-*`), and rewrite
the "single rule against `workflow-*`" sentence to acknowledge entry scoping. Either
re-justify the `workflow-` prefix on its real (intra-entry disambiguation) merit, or
reconsider whether it earns its keep now that entry scoping is confirmed. Mirror the
correction in Part 38 D16's "`workflow-` endpoint prefix" paragraph. This is a
factual error in the source design; designs are the source of truth.

### 2. Which app's `review` verb decides `submit` → `in-review` vs `done`?

The `submit` resolution is the one FSM cell that reads `access`:

> Part 38 D4: "`submit` picks in-review vs done from the action's static
> `access.{app_name}` review verb (nullary — no payload input)."
> Part 34 D6: signal table; the in-review/done split keys on the review verb.

The action's landing stage is **shared** state (one action doc, all apps see the
same `status[0].stage`), but the phrasing is **per-app** (`access.{app_name}`). For
a multi-app action where `team-app` declares `review` and `support-app` does not,
"the submitting app's review verb" yields *different terminal behaviour for the same
action depending on who submits it* — a `team-app` submit lands `in-review`, a
`support-app` submit lands `done`. That is almost certainly wrong: the existence of
a review step is a property of the action, not of the submitter.

Part 38's own `resolveSignal` signature is evidence the intended rule is
app-agnostic — it takes no `currentApp`:

> Files changed: "`resolveSignal.js` — the `(action, signal, payload, actionConfig)
> → targetStage | null` function."

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

Finding 2 means the *presence* of a `review` verb determines which stages are
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
lists as amend-via-note — but Part 38 now *implements* it.

**Fix.** Decide whether the Part 34 absorption should be its own part (or a cleanly
separable task cluster) sequenced alongside the engine rebuild, rather than folded
into it. At minimum, group the access-model work as its own task block in tasking so
it can be built/reviewed independently of the load-plan-commit core. (This connects
to the open scope question already raised with the author about `action_role_check`.)

### 6. `notification_roles` moved to the action root, but the extractor is not in Files-changed

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

The rebuilt engine reads `<slug>.links` (plural map); pre-migration action docs
carry `<slug>.link` (singular), and page ids change under the `workflow-` prefix. An
action that never transitions again keeps its old shape — display surfaces read
`.links`, find nothing, and render no link. Part 38's demo migration strips authored
`link:` from *config cells* but specifies no backfill of existing *action docs*.

This is acceptable **only** because there are no shipped workflows (Part 34 leans on
this too), but Part 38 leaves the assumption implicit. If any environment (even a
demo seed) has live action docs, they'll silently lose link affordances.

**Fix.** State explicitly in Part 38 (Schema additions or Non-goals) that no
in-flight action-doc backfill is provided, justified by the greenfield assumption.
If the demo seeds action docs, add a one-off migration or re-seed step to the demo
migration task.

## Minor

### 8. Silent runtime invisibility when `edit` is declared without `view`

`visible_verbs_filter.yaml` drops an action when no verb is true for the user
(Part 34 D12, `$match $anyElementTrue`). Combined with independent verbs (Part 34
D4) and the lint-warn-not-error on `edit`/`review`/`error` without `view`, an author
who writes `edit: [manager]` and forgets `view` makes the action **invisible** to
every non-manager (no read-only fallback). The only guard is a build-time
*warning*.

**Fix.** No schema change needed (the independence is deliberate, D4), but ensure
the lint warning is prominent / hard to miss, and call out this failure mode in the
Part 34 D4 rationale so authors understand "edit without view = invisible to
everyone else," not just "you probably forgot view."

### 9. (Positive — make it intended) Access check before pre-hook side effects

Putting the per-verb access check in the **load** phase (Part 38 D2) means an
unauthorized submit is rejected *before* the pre-hook fires — so unauthorized users
never trigger pre-hook external side effects (callApi, third-party writes). This is a
genuinely good consequence of the phase ordering, currently implicit.

**Fix.** State it as an intended property in D2/D16 (one sentence) so a future
refactor doesn't move the check after the pre-hook and quietly regress it.

## What checks out (verified this pass)

- The absorption is textually clean: no surviving single-`link`, `access.roles`,
  verb-array-shorthand, or "get-entity-workflows needs no edits" references (grep).
- `makeActionPages.js:43` confirms the *current* code reads `access.{app}` as a verb
  **array** (`accessVerbs.includes(v)`) and emits un-prefixed ids — i.e. Part 38's
  "read map keys + `workflow-` prefix" change is real work, correctly scoped.
- `access_filter.yaml` confirms the *current* filter reads the removed action-wide
  `access.roles` and the `[view, edit, review]` shorthand — so the
  `visible_verbs_filter.yaml` replacement is genuinely required, not cosmetic.
- The demo `install-step.yaml` carries the old `access.demo: { roles, verbs }` shape,
  matching Part 38's corrected migration line.
- The per-verb `links` map and UI priority `edit > review > error > view` are
  internally consistent with the engine nulling the irrelevant cell per stage
  (Part 34 D7) — no stale "compound cell" table remains in Part 38.
- D16 correctly keeps role gates *out* of `computeEngineLinks` (links are computed
  for all declared verbs; the UI filters via `visible_verbs`) — consistent with
  Part 34 D7.
