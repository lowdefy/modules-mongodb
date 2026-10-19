# Review 1 — Submit Pipeline (engine/spec contract gaps)

Review of `designs/workflows-module/submit-pipeline/`. Focuses on **internal contract issues inside submit-pipeline itself** — pre-hook return shape inconsistencies, engine-decision contradictions, missing fields, and step-ordering questions that need answering before implementation.

## Internal contract inconsistencies

### 1. Pre-hook return shape disagrees with itself across the design

> **Resolved.** Updated design.md:68's two-field summary to list all four fields (`actions`, `event_overrides`, `form_overrides`, `hook_error`) with a pointer to Decision 4 for the full contract.

`design.md:68` (the lifecycle summary inside Decision 1) describes the pre-hook return as `{ actions: [...], event_overrides: {...} }` — two fields. `design.md:208-220` (the formal contract) lists **four** fields: `actions`, `event_overrides`, `form_overrides`, `hook_error`. `spec.md:160-167` matches the four-field version.

Both `form_overrides` and `hook_error` are load-bearing in the rest of the design — `form_overrides` is referenced at `design.md:217` and `spec.md:164`; `hook_error` drives the abort path (`design.md:223`, `spec.md:169`). The two-field summary at `design.md:68` is just stale prose.

**Fix:** Update `design.md:68` to read `{ actions: [...], event_overrides: {...}, form_overrides: {...}, hook_error: <string> }`. A reader scanning Decision 1's step list will otherwise miss two of the four extension points.

### 2. `form_overrides` semantics aren't actually defined

> **Resolved.** First, restructured engine D5 to drop the `.review` and `.error` reserved sub-keys — `form_data` is now one flat tree per action, and error context lives on the action doc's status entry. This collapses two of the four ambiguities in the review (no `.review` routing, no `.error` write surface). For the remaining two: pre-hook wins on collision (it ran later), and `form_overrides` is skipped on abort (`hook_error` takes the error-transition path with no `form_data` writes). Cross-design propagated to engine design+spec, module-surface design+spec, action-authoring design+spec, ui design+spec; submit-pipeline got an explicit "`form_overrides` semantics" subsection.

`form_overrides` is listed in the pre-hook return as "optional; additional fields to `$set` on `form_data.{action_type}[.{key}]`" (`design.md:217`, `spec.md:164`). That's the entire definition.

Open questions the design doesn't answer:

- Does `form_overrides` merge with the submitted `form:` payload, or layer on top? If the user submitted `form: { contact_name: "Alice" }` and the pre-hook returns `form_overrides: { contact_name: "Bob" }`, which value lands in `form_data.qualify.contact_name`?
- Does `form_overrides` go to `.review` if the interaction is `approve`/`request_changes`? The submitter's vs reviewer's fields land at different paths (`form_data.{action_type}.{field}` vs `form_data.{action_type}.review.{field}` per engine D5) — `form_overrides` doesn't disambiguate.
- Can a pre-hook write to `.error` via `form_overrides`? If `hook_error` is set alongside, the engine writes `.error` itself (engine D5) — does `form_overrides` get appended or ignored?
- Are reserved sub-keys (`review`, `error`) rejected if they appear as top-level keys in `form_overrides`? Engine D5 says these names are reserved at the action-author level; the pre-hook is engine-adjacent and arguably allowed to write them.

**Fix:** Add a "Pre-hook `form_overrides` semantics" subsection in Decision 4 spelling out: precedence vs user `form:` payload (suggest: pre-hook wins, since it ran later); routing to `.review` (suggest: keyed by `interaction` — `form_overrides` for `submit_edit` writes the submitter path, for `approve`/`request_changes` writes the reviewer path; pre-hook can override via a `_target: review` discriminator if it needs the other path); collision behaviour with reserved sub-keys.

### 3. `event_overrides` build-time injection conflicts with action-YAML override path

> **Resolved.** Committed to the spec's build-time approach explicitly: resolver bakes `action.event` into the endpoint payload's keyed `event_overrides` map; handler resolves `event_overrides[interaction]` once on entry; pre-hook's unkeyed `event_overrides` merges over that. Updated design.md Decision 5 override paths and spec.md "Override paths" section to match.

`spec.md:77-79` shows the generated endpoint baking `event_overrides:` into the API payload as a build-time literal from `action.event[interaction]`. So the plugin handler receives `event_overrides` already — no need to read from the action YAML at handler time.

But `design.md:290` describes the override merge order as **runtime**: "Pre-hook's `event_overrides` field is merged over the action-YAML defaults, which are merged over the engine defaults." That implies the plugin handler reads `action.event[interaction]` itself.

These describe two different implementations:

- **Spec's version:** Resolver bakes `action.event[interaction]` into the endpoint's payload field at build. Handler gets `event_overrides: { type, display, metadata }` already resolved per-interaction. Pre-hook overrides merge over that one bag.
- **Design.md's version:** Handler receives the raw `interaction` value and reads the action's `event:` block from its own config at runtime to select the right per-interaction overrides. Pre-hook overrides merge over that.

The two differ in where action-YAML overrides resolve. The spec's version is simpler (resolver does the per-interaction selection at build) but the design.md prose suggests runtime resolution.

**Fix:** Pick one. Recommend the spec's version — the per-interaction `event:` block is static per action, baking the resolved bag into the endpoint payload is consistent with how `hooks:` (the api-id map) is already baked in (`spec.md:71-76`). Update `design.md:290` to match: "Pre-hook's `event_overrides` is merged over the build-time-resolved `event_overrides` already on the endpoint payload."

### 4. `event_overrides` payload shape isn't keyed by interaction in the design

> **Resolved.** Kept the field name `event_overrides` on both surfaces (endpoint payload + pre-hook return) and documented the keyed-vs-unkeyed shape difference. The resolver emits a per-interaction map at build time because it can't know which interaction the runtime payload will carry; the handler resolves `event_overrides[interaction]` once on entry and treats the result as a scalar bag, which is what the pre-hook return shape matches. Added clarifying paragraphs to design.md Decision 2 and spec.md "Per-action Api" section.

`spec.md:77-79` shows the generated endpoint includes `event_overrides` as a **map keyed by interaction**:

```yaml
event_overrides:
  submit_edit: { type, display, metadata }
  approve: { type, display, metadata }
  ...
```

But the pre-hook contract (`design.md:216`, `spec.md:163`) describes `event_overrides` as a single object — `{ type, display, metadata }` — already scoped to one interaction. So inside the handler, `event_overrides` would either be the whole interaction-keyed map (matching the endpoint payload) or one interaction's overrides (matching the pre-hook return). It can't be both.

**Fix:** Disambiguate. Suggest: endpoint payload keys it `event_overrides_by_interaction: { submit_edit: ..., approve: ... }`; handler resolves `event_overrides_by_interaction[interaction]` once, then has one bag to merge pre-hook output against. The pre-hook keeps the unkeyed-bag contract.

## Step ordering bugs

### 5. Decision 1 step 11 fires `on_complete` after notifications but `completed_groups` is computed at step 6

> **Resolved.** Added one-sentence ordering rationale to step 11 in design.md Decision 1: "Runs after notifications dispatch so phase-complete hooks observe the log event already in the database and any notifications already in-flight; runs before the post-hook so the post-hook can react to group fan-out outcomes." Documentation-only — no design change.

Decision 1 (`design.md:71-79`) orders the engine steps as:

```
5. Write action transitions
6. Recompute workflow summary + groups[]    ← completed_groups computed here
7. Write form_data + workflow doc updates
8. Generate log event
9. Dispatch notifications
10. (no entry — step numbering 11 follows)
11. Fire group on_complete pipelines        ← consumes completed_groups from step 6
```

Functionally correct (step 6 already produced `completed_groups`, step 11 reads it), but the design embeds an undocumented constraint: **group `on_complete` fires after notifications**. Action-groups D5 step 7's return value lists `completed_groups`, and action-groups D6 commits the hook is "at Layer 1" without specifying ordering vs notifications/events. The submit-pipeline ordering quietly chooses a position.

Realistic question: should the `on_complete` for a completed group see the event log entry from this submit in its references? Yes if it fires after step 8 (current ordering); no if it fires before. The current ordering supports "phase-1-complete reads the submit event," which feels right.

**Fix:** Add one sentence to Decision 1 step 11 explaining the ordering choice: "Fires after notifications so phase-complete hooks observe the just-emitted log event and any notifications already dispatched; runs before the post-hook so post-hook can react to the group-complete fan-out's results."

### 6. Tracker subscription (step 12) before post-hook (step 13) — post-hook can't see what tracker did

> **Resolved.** Added `result.tracker_fired` to the post-hook payload — null when no tracker propagation happened, otherwise `{ parent_action_id, parent_workflow_id, new_status }`. Also surfaced on the top-level API return shape so page-side callers (not just post-hooks) can read it. Hooks that need the parent's post-write doc fetch by `parent_workflow_id` themselves rather than the engine eagerly loading it. Design + spec updated.

Step 12 fires the tracker subscription; step 13 fires the post-hook. The post-hook payload (`design.md:227-239`, `spec.md:174-181`) doesn't carry any tracker-fire signal:

```
result:
  action_ids: array<string>
  completed_groups: array<string>
  event_id: string
```

If the tracker subscription propagated this submit to a parent workflow (the workflow auto-completed and a parent tracker action moved to `done`), the post-hook has no way to know. Realistic use: a post-hook that wants to fire a Slack message saying "Lead onboarding complete, parent tracker also flipped" can't get the second half from the payload.

Review-1 #6 raised post-hook side-effect blindness as a general issue. This is the specific case: the tracker fire's outcome is engine-owned and should be in the post-hook payload.

**Fix:** Add to the post-hook `result`:

```
tracker_fired: {
  parent_action_id: string,
  parent_workflow_id: string,
  new_status: string,
} | null
```

Null when no tracker subscription fired this call.

### 7. Step 12 sync-vs-async tension contradicts itself across the design

> **Resolved.** Closed in favour of engine D3's existing commitment (sync in-process). Dropped Open Question 3 from design.md and the matching open question from spec.md. Inline lifecycle markers updated in both files: step 12 in Decision 1 (`design.md`), step 9 in the proposed-shape box, step 10 in the spec's flow diagram, and the side-effects table row all now say "sync in-process per engine D3" instead of `[open: sync vs async]`. Open Questions list renumbered.

`design.md:78` ("step 12: tracker subscription") flags the question as **open** ("current engine Decision 3 commits this as synchronous in-process; Steph's review proposed async via an UpdateAction-like call. Surface as open question for review.").

Open Question 3 (`design.md:328-331`) then ends with "Recommend keeping sync as the default; revisit if real load surfaces latency issues" — recommending closing as `sync`.

`spec.md:286` mirrors the same tension: "current recommendation is keep sync."

Two issues:

- **The recommendation already exists in engine D3** (`engine/design.md:280-285`), which closed this with strong rationale (audit-history determinism, single-client semantics, idempotency). Submit-pipeline reopening it without addressing engine D3's arguments is unmotivated.
- **The recommendation is to keep sync but the question is still open.** Either it's closed (drop the open-question framing) or the engine D3 commitment needs to be reopened explicitly with a citation of what changed.

Review-1 #14 raised this; the fix is the same. Calling it out again because the spec's framing makes this look like a known concession ("open: sync/async" in the Side-effects table at `spec.md:234`), not a re-opening of a closed decision.

**Fix:** Remove the "[open: sync/async]" from spec.md:234 and from `design.md:78`. Drop Open Question 3 entirely. Add one sentence in Decision 1 step 12: "Synchronous in-process per engine Decision 3; submit-pipeline does not re-open this."

## Missing or under-specified contracts

### 8. `force: true` semantics for engine-internal writes are unaddressed

> **Resolved.** Added per-entry `force: true` to the pre-hook `actions[]` contract (submit-pipeline design + spec). Engine D4 expanded to document the two surfaces: per-call `force` on `UpdateWorkflowActions` (migrations/admin) and per-entry `force` on each `actions[]` entry (submit-pipeline pre-hook replay/rollback). The two compose with OR. Engine spec's `UpdateWorkflowActions` payload now lists `force?` on each entry.

Engine D4 (`engine/design.md:393-400`) says tracker writes use `force: true` to bypass the priority rule. Submit-pipeline's engine handler now also writes action transitions from the pre-hook's `actions[]` (Decision 1 step 5) — these are engine-driven writes layered on top of the user's submission.

Open question: do the pre-hook `actions[]` entries use `force: true`? The priority rule will reject some legitimate cases:

- Pre-hook returns `{ type: notify-customer, status: action-required }` to auto-unblock a downstream action. The current state of `notify-customer` is `blocked` (priority 7); `action-required` is priority 6 → strictly less than → allowed. Fine.
- Pre-hook returns `{ type: cancel-other-action, status: not-required }`. The current state is `done` (priority 3); `not-required` is priority 0 → strictly less than → allowed. Fine.
- Pre-hook returns `{ type: replay-action, status: action-required }`. The current state is `done`. Priority 6 > priority 3 → **rejected by priority rule**. Pre-hook's intent silently fails.

This is realistic — a pre-hook validating "customer wants to redo qualification" would set the action back to `action-required`. Currently silent no-op.

**Fix:** Spell out the priority-rule semantics for pre-hook `actions[]`:

- Default: priority rule applies, no `force`. Pre-hook authors learn this.
- Add an explicit `force: true` flag per pre-hook action entry. Document it as the escape hatch for replay/rollback scenarios.

Update the pre-hook return contract:

```
actions: array
  - type: string
    key: string | null
    status: string
    fields: object
    upsert: boolean
    force: boolean     # NEW; optional; defaults to false
```

### 9. Hook `auth:` semantics: is the hook re-checking the role gate?

> **Resolved.** Hooks keep their own `auth:` blocks (no special-casing of the call-api primitive); authoring rule is `hook.auth.roles ⊇ action.access.roles`, with `auth.public: true` rejected at build. `makeWorkflowApis` validates the relationship per (action, hook) pair and fails the build on mismatch. This keeps Lowdefy Apis as first-class APIs with their own auth, prevents the engine's role gate from being bypassed via direct endpoint access, and stops the "hook stricter than action → hard-failing submit" surprise. Added "Hook auth gate" subsections to submit-pipeline design Decision 4 and spec; added the build-time validation rule to action-authoring spec's `makeWorkflowsConfig` per-action checks; dropped the matching open question from both submit-pipeline files.

Open Question 5 (`design.md:333-334`) flags this — hook auth is described as "passes through caller's roles" but unspecified. Adding concrete shape:

- The pre-hook is a Lowdefy Api. Lowdefy Apis carry their own `auth:` block (which roles can invoke this endpoint).
- When `context.callApi(preHookId, payload)` fires, the call-api primitive inherits the caller's user context (call-api D2). So `_user: roles` resolves to the submit-pipeline caller's roles inside the pre-hook's routine.
- The pre-hook's `auth:` block is evaluated against those roles. If the pre-hook is configured `auth: { public: false, roles: [admin] }` and the submit caller doesn't have `admin`, the call fails — even though the action's `access.roles` already passed at the submit-pipeline entry.

Realistic case: an author wants the pre-hook routine accessible only to admins (because it does sensitive ops), but the action itself is accessible to any user. With auth pass-through, the pre-hook hard-fails for non-admin users → submit aborts for them.

Two possible designs:

- **Pre-hook auth is the engine's responsibility, not the hook's `auth:` block.** Engine treats hook APIs as engine-internal; the hook's `auth:` is ignored on `context.callApi` invocation. Authors lose a check they used to have.
- **Pre-hook auth is the author's responsibility — they ship `auth: { public: true }` on hook APIs, knowing the engine is the only caller.** Engine documents this convention; build-time validation can check that hook APIs have `public: true`.

**Fix:** Pick one and document. Recommend option 2 — keeps hooks first-class Lowdefy APIs with normal semantics. Add to spec: "Hook APIs declare `auth: { public: true }`; the engine is the only caller. Build-time validation in `makeWorkflowApis` warns when a hook API has restricted auth."

### 10. `current_status` on the per-action endpoint — who picks it?

> **Resolved.** Added "Interaction → target status" section to design Decision 3 and spec Button-vocabulary section. Three-layer last-wins precedence: engine defaults (`submit_edit → in-review` if review verb exists else `done`; `approve → done`; etc.), then an optional `interactions:` block on the action YAML, then a `status` field on the pre-hook return. Task `submit_edit` keeps caller-supplied `current_status` (status selector on task-edit). Pre-hook `status` added to the pre-hook return contract in both design.md and spec.md.

Submit-pipeline drops `submit-action`'s `current_status` payload field (review-1 #7 partly covers this). The new per-action endpoint payload (`spec.md:67-76`) shows `interaction` but **no `current_status`**. The engine evidently picks the status from the interaction at handler time. But where is the interaction → status mapping defined?

Looking at the design:

- `submit_edit` → ??? (presumably `in-review` for form actions that need review, `done` otherwise)
- `not_required` → `not-required`
- `submit_error` → ??? (probably back to `in-review` or `done`)
- `approve` → `done`
- `request_changes` → `changes-required`

The design never spells these out. Submit-pipeline's "engine becomes the orchestrator" means the engine has to know this map. Where's it defined? Hard-coded in the handler? Read from action YAML? Per-interaction default with author override?

**Fix:** Add a "Interaction → status map" table to Decision 1 (or to Decision 3 next to the button vocabulary). Spell out the default mapping per interaction. Decide whether actions can override per-interaction (e.g. a `qualify` form that doesn't have review goes `submit_edit → done` directly; one that does goes `submit_edit → in-review`). Suggest:

```
| interaction       | default target status (form) | default target status (task) |
|-------------------|------------------------------|------------------------------|
| submit_edit       | in-review (if review verb exists), else done | done (user-picked status overrides via task selector) |
| not_required      | not-required                 | not-required                 |
| submit_error      | error                        | error                        |
| approve           | done                         | done                         |
| request_changes   | changes-required             | changes-required             |
```

Allow per-action override via the action YAML's `interactions:` block (mirror of the `hooks:`/`event:` blocks).

## Cross-design references

### 11. "Hooks contract" references a fixed schema for `pre_hook_payload.context`

> **Resolved.** Both design.md and spec.md pre-hook context blocks now explicitly say "pre-call state — before any engine writes." Post-hook scoping (#12) is left for interactive resolution.

`design.md:202-204` and `spec.md:152-155` describe the pre-hook context bag as:

```
context:
  workflow: <full workflow doc>
  action:   <full action doc>
```

Two ambiguities the spec needs to close:

- **"Full" workflow doc means what?** Workflow docs carry `form_data`, `groups[]`, `summary`, `status` history. All of it? Including the just-submitted (unmerged) form values from the current call, or the pre-call state?
- **"Full" action doc means what?** Action docs carry `status` history. Pre-call state, or post-step-1 state? In Decision 1's ordering, the pre-hook is **step 2** (`design.md:68`), before the engine writes step 5 — so the docs are pre-call.

The "before any engine writes" wording at `design.md:186` is decisive — pre-hook sees pre-call state. But spec.md and the contract block don't say it.

**Fix:** Spec the pre-hook context as **pre-call state explicitly**:

```
context:
  workflow: <full workflow doc as it stands before this submit's writes>
  action:   <full action doc as it stands before this submit's writes>
```

Document the "pre-call" semantics so authors don't try to read post-submit state from the context bag.

### 12. Post-hook context is post-write — but how does it see the engine-internal writes?

> **Resolved.** Documented `context.workflow` and `context.action` explicitly as "the submit workflow's docs post-write" in both design.md and spec.md. Parent workflow is intentionally not included on tracker fire — `tracker_fired` (added per #6) carries the boolean signal plus the `parent_workflow_id` for hooks that need to fetch the doc themselves. Avoids eager-loading a parent doc most post-hooks won't read.

By symmetry, `design.md:238` and `spec.md:179` say the post-hook context is "workflow + action docs as they now stand." Now stand when? After step 12 (tracker subscription) but before the post-hook itself (step 13). If the tracker subscription triggered an auto-complete chain on the parent workflow, the post-hook's `context.workflow` is the **child** workflow's post-write doc but the parent's writes are also durable.

Realistic question: a post-hook wants to know "did this submission cascade to the parent?" The `result.tracker_fired` field (proposed in #6 above) covers the signal; but the `context.workflow` field is misleading if it only carries the child workflow doc.

**Fix:** Either rename to `context.submit_workflow` to make the scoping clear, or extend `context` with a `parent_workflow?: <doc>` field that's populated when the submission propagated upward.

## Spec hygiene

### 13. Spec line 234 has stale `[open: sync/async]` after the recommendation is to close sync

> **Resolved.** Recursion description fixed in the earlier pass; the `(open: sync/async)` framing dropped now that #7 closed in favour of sync. Side-effects table row reads "Synchronous in-process per engine D3. Engine writes parent tracker action via internal `updateAction` recursion; `SubmitWorkflowAction` invocations don't recurse on themselves."

`spec.md:234`:

```
| Tracker subscription | When workflow status changed (open: sync/async)   | Engine writes parent tracker action via `SubmitWorkflowAction` recursive call               |
```

Two issues:

- `(open: sync/async)` should be removed if Open Question 3 is closed (see #7 above).
- "Engine writes parent tracker action via `SubmitWorkflowAction` recursive call" — engine D3 says the parent tracker write goes through `updateAction` (not a recursive `SubmitWorkflowAction` invocation). `SubmitWorkflowAction` is the new name for `UpdateWorkflowActions`; the recursion happens at the helper level inside the handler, not as a top-level Api call.

**Fix:** Update spec.md:234 to: "Engine writes parent tracker action via internal `updateAction` recursion (engine D3); `SubmitWorkflowAction` invocations don't recurse on themselves."

### 14. Spec connection-structure listing duplicates engine spec's

> **Resolved.** Replaced the duplicated tree at spec.md:35-48 with a one-line pointer to engine spec.

`spec.md:35-48` lists the new connection structure (`src/connections/WorkflowAPI/SubmitWorkflowAction/...`). Engine spec already owns the connection structure; submit-pipeline restating it splits the source of truth.

**Fix:** Drop spec.md:35-48 in favour of a single line: "See engine spec for the updated connection structure; submit-pipeline adds the files listed there under `SubmitWorkflowAction/`."

### 15. "Notifications dispatch" description still references `event_ids` payload that comes from somewhere

> **Resolved.** Added an "Event-id flow into notifications" paragraph to design.md Decision 6 spelling out that step 8's `new-event` event id is threaded into step 9's notifications dispatch payload as `event_ids: [<event_id>]`. One submit = one event = one dispatch in v1.

`spec.md:232` says notifications are dispatched via `context.callApi('send-notification', module: 'notifications')` "with `{ event_ids }`" — but `event_ids` is the result of the log event step (D5 step 8). The spec doesn't say the engine collects the event id from step 8 and passes it to step 9. Implicit but not stated.

Review-1 #15 raised the recipient-list resolution question; this is the adjacent gap on the event-id flow.

**Fix:** One sentence in Decision 6: "Engine threads the log event id (returned by step 8's `new-event` invocation) into the notifications dispatch payload as `event_ids: [<event_id>]`. Multi-event submissions aren't possible in v1 — one submit = one event."

## Summary

- **3 internal-contract fixes (priority — needed before implementation):** #1 (pre-hook return shape), #4 (`event_overrides` keyed vs unkeyed), #10 (interaction → status map)
- **3 contract clarifications:** #2 (`form_overrides` semantics), #8 (pre-hook actions[] + `force`), #9 (hook auth pass-through behavior)
- **2 step-ordering fixes:** #5 (on_complete ordering rationale), #6 (post-hook misses tracker_fired)
- **2 cross-design alignment fixes:** #7 (close tracker sync open question), #14 (don't duplicate engine spec)
- **5 hygiene / spec fixes:** #3 (event_overrides build vs runtime), #11 (pre-hook context scoping), #12 (post-hook context scoping), #13 (stale spec line), #15 (event-id flow into notifications)

Critical path: #1, #4, #10 — without these, the per-action endpoint and pre-hook contract cannot be implemented unambiguously. The rest are tightening, not blocking.
