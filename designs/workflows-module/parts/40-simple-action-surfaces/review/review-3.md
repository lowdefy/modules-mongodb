# Review 3 — Band 1 task files vs. the post-review-2 design

Scope: the **band 1** tasks on the demo-critical path — `01-resolver-simple-action-buttons.md`,
`03-check-action-surface.md`, `04-rewrite-check-pages.md` (tasks.md: Band 1 = 1 → 3 → 4).
This pass checks the task files against the current `design.md` (heavily revised by review-2's
resolutions) and against shipped code. The design prose itself was already verified by reviews 1–2;
the problem this pass surfaces is that **the band-1 task files were generated before review-2 and
still describe the killed `global.simple_action_buttons` model**, plus three smaller drifts. Per
the design's own `open-questions.md` §6, the tasks are known-stale and slated for regeneration — this
review pins exactly what must change so the regenerated band-1 tasks are correct.

Code facts verified this pass:
- `modules/workflows/enums/button_signal_sources.yaml` exists with the six-signal source-stage map
  Task 3 quotes (Part 39 shipped it). ✓
- `modules/workflows/components/action_role_check.yaml` writes the per-verb map to a **root**
  `action_allowed` key via `SetState` (per-verb migration already shipped). ✓
- `allow_not_required` and `simple_action_buttons` appear **nowhere** in `modules/` or `plugins/`.
- `planActionTransition.js` (src, ~L174–190) stamps `doc.access` / `doc.workflow_type` / `doc.tracker`
  from `actionConfig` on every plan — the exact denorm block D3 targets for `allow_not_required`.
- `loadWorkflowState.js` (src, ~L169–176) holds the per-verb access gate that throws `access_denied`
  — the exact site D3 puts the `not_required` server gate beside.

## Blocking — task contradicts the current design

### 1. Task 01 implements a mechanism the design deleted; the feature it should task (`allow_not_required`) is untasked

> **Deferred to task regeneration.** The design is already correct (D3 / Files-changed `:211`): Task 01
> should validate the optional boolean `allow_not_required` and carry it through `ACTION_FIELDS`, with
> no `simple_action_buttons` global. The task file is stale (predates review-2 #2). Fixed by regenerating
> the Band-1 tasks via `/r:design-task`; this finding is the spec for the regenerated Task 01.

`01-resolver-simple-action-buttons.md` is entirely about computing a per-simple-action button-visibility
map (`{<signal>: {visible}}` for all six signals, defaults table, author opt-out) and emitting it as
`global.simple_action_buttons`. Review-2 #2 (resolved) **dropped the per-action button map outright** —
the design's D3 (`design.md:113–125`) now says: "All other buttons … are **fixed** on the simple
surface — no config map, no resolver, no global." There is no `simple_action_buttons` in the design
anymore, and `grep` confirms none in code.

What D3 actually requires of `makeWorkflowsConfig` is one line in the Files-changed table
(`design.md:211`): *"Validate the authored `allow_not_required` action-root key (boolean, optional)."*
That is the real band-1 resolver task, and it is **not** tasked anywhere — Task 01 tasks the dead
feature instead.

**Fix.** Rewrite Task 01 to: validate the optional boolean `allow_not_required` at the action root in
`makeWorkflowsConfig.js` (any kind; default absent = `false`), add it to `ACTION_FIELDS` (the picked-field
list at `makeWorkflowsConfig.js:7`) so it survives into the workflow config, and unit-test the
boolean validation + that it's carried through. Delete every `global.simple_action_buttons` reference,
the defaults table, and the "first global-config emission" hand-wave (Task 01 step 2 / Notes). Task 3's
`Depends On: 1` becomes "Task 3 needs `allow_not_required` validated/carried so the surface can read
`surface.action.allow_not_required`."

### 2. Task 03's three-way AND with `_global: simple_action_buttons` is the deleted model

> **Deferred to task regeneration.** The design is already correct (D2/D3, `design.md:89–125`): five
> buttons are a two-term AND (FSM source-stage AND per-verb role gate); `not_required` adds the
> doc-borne `_state: surface.action.allow_not_required` term — no `_global: simple_action_buttons`
> anywhere. Task 03's three-way AND and the `<type>` Notes paragraph are stale. Fixed by regenerating
> Task 03 via `/r:design-task`; this finding is the spec.

`03-check-action-surface.md` (Button visibility, L43–53, L105, L108, L119) gates **every** button with a
three-way AND whose first term is `_global: simple_action_buttons.<type>.<signal>.visible`. Per the
current D2/D3 (`design.md:89–125`):

- **Five of six buttons** (`submit`, `progress`, `approve`, `request_changes`, `resolve_error`) are
  **fixed** — a **two-term** AND: FSM source-stage membership **AND** per-verb role gate. No author
  opt-out term at all.
- **`not_required` alone** adds a third term, and it reads the **doc-borne** flag
  `_eq: [{ _state: surface.action.allow_not_required }, true]` (D3 "Read (client)", `design.md:121`) —
  **not** `_global: simple_action_buttons`.

The design's own visibility block (`design.md:91–99`) shows exactly this shape. Task 03 must be rewritten
to it: drop the global term from the five fixed buttons, and give `not_required` the
`surface.action.allow_not_required` third term. Also fix Acceptance line 108 ("reads … `_global:
simple_action_buttons`") and the Notes "<type>" paragraph (L119), which only exists to serve the dead
per-type lookup.

### 3. Tasks 03 & 04 render the Part 33 events-timeline *inside* the surface — review-2 #4 made it page-level

> **Deferred to task regeneration.** The design is already correct (D1, `design.md:68`; D5, `:163`): the
> Part 33 events-timeline is page-level chrome on `workflow-action-view`, **below** the surface `_ref`,
> never inside the surface (so it can't leak into the modal and collide on the fixed `get-events`
> request id). `view` mode is header + read-only fields + status-history only. Tasks 03/04 are stale.
> Fixed by regenerating them via `/r:design-task`; this finding is the spec.

Task 03 (mode table L32, body L35, view-mode L97) and Task 04 (L13, L19) put the events-timeline `_ref`
inside the surface's `view` mode ("now living **inside** the surface component"). Review-2 #4 (resolved)
moved it out: D1 (`design.md:68`) states *"The Part 33 events timeline is page-level chrome, **not** part
of the surface,"* rendered by `workflow-action-view` **below** the surface `_ref`; the modal omits it.
The design gives a hard build reason, not just a preference: a second `events-timeline` instance would
collide on the component's fixed `get-events` request id (request ids are not `_ref`-scoped → Lowdefy
build throws `Duplicate requestId`).

As written, the tasks would have the implementer place the timeline in the surface, which then renders
inside the **modal** too (Task 5 `_ref`s the same surface) — re-introducing exactly the duplicate-request-id
collision D1 calls out.

**Fix.** Task 03: `view` mode renders header + read-only fields + status-history only (status-history is a
List over `surface.action.status`, no request — `design.md:63`); remove the events-timeline from the surface.
Task 04: `workflow-action-view` keeps the Part 33 events-timeline `_ref` **page-level, below the surface
`_ref`** (and only there).

## Blocking — open question baked into band-1 tasks

### 4. Tasks 03 & 04 commit to `surface.action_allowed`, but that placement is the still-open review-2 #3

> **Rejected.** Decision 2026-06-08: keep `action_allowed` under `surface.*` (review-2 #3's resolution
> stands; no revert). This recommendation — read root, drop it from the surface contract — under-weighted
> host-namespace ownership: the modal renders inside a host entity page's state, and the module keeps
> **all** its vars in its own namespace rather than writing a module-internal key into the host's root.
> That's a structural namespace-hygiene rule, not a per-var collision judgement, so "single writer /
> computed output" doesn't make root acceptable here. The shared `action_role_check` still writes root
> `action_allowed`; each caller copies it into `surface.action_allowed` via a `SetState`. Tasks 03/04
> correctly read `surface.action_allowed.{verb}`. (open-questions §1 updated to match.)

The surface state contract in both tasks reads the role gate at `_state: surface.action_allowed.{verb}`
(Task 03 L23/L52; Task 04 L24/L61). Per `open-questions.md` §1, review-2 #3 is the **one finding still
open**, and its standing recommendation is the **opposite**: keep the shipped **root** `action_allowed`
key (verified — `action_role_check.yaml` `SetState` target is root `action_allowed`, read by every form
page as `_state: action_allowed.{verb}`) and **drop `action_allowed` from the `surface.*` contract**,
because it has one writer and is computed output, not collision-prone input state.

Task 04 even prescribes the glue the recommendation explicitly rejects (L61: *"either by parameterising
the component's target key, or by a following `SetState` that maps it"* → "relocates the opt-in-correctness
drift rather than removing it; a trailing remap `SetState` is glue").

This is decision-before-implementation: if the recommendation is accepted, tasks 03/04 should read
`_state: action_allowed.{verb}` (root) and `surface.{action, fields, comment}` only — no remap step.
**Close review-2 #3 first**, then regenerate band-1 tasks against the decision. Building task 03/04 as
currently written hardcodes the about-to-be-reverted namespace.

## Minor

### 5. Stale "Part 34 must land before this part" caveat in both tasks and tasks.md

> **Resolved.** The "must land before" caveat was cut from Task 03 Notes, Task 04 Notes, and `tasks.md`
> during the review-2 #3 resolution (this session) — the per-verb `action_allowed` map already ships
> (`action_role_check.yaml` + `evaluateVerbGate.js`, commit 68b9b09). All three now state the per-verb
> shape is shipped with no upstream wait.

Task 03 Notes (L118), Task 04 Notes (L61), and `tasks.md` L54 all say the per-verb `action_allowed`
migration is "Part 34's scope" and "must land before this part." Review-2 #3's note (and this pass)
confirm it **already shipped** — `action_role_check.yaml` + `evaluateVerbGate.js` write the per-verb
`{view, edit, review, error}` map today. Cut the "must land before" cross-wave caveat from all three; the
surface can be written against the per-verb shape with no upstream wait.

### 6. The `allow_not_required` *engine* work (persist + server gate) is untasked in either band

> **Resolved.** Decision 2026-06-08: the `allow_not_required` engine work becomes a **dedicated engine
> task in Band 1** — (a) stamp the flag from config in `planActionTransition`'s per-transition denorm
> block (beside `access`/`workflow_type`, ~L174–190), and (b) the kind-agnostic load-phase gate in
> `loadWorkflowState` (~L169–176) rejecting a user-driven `not_required` off live config. Because it
> lands in Band 1 alongside the surface, `not_required` is fully persisted + enforced from the first
> wave — **no Band-1 stub**, so `tasks.md`'s accepted-stubs list gets no entry for it. Unit coverage:
> set/absent/never-copied-forward on the persist; the gate rejects a user-driven `not_required` off
> config while passing engine-driven signals. The task is created when the Band-1 tasks are regenerated
> (this review is the spec).

D3 (`design.md:120, 122`) and Files-changed (`design.md:220`) require two engine changes: (a) stamp
`allow_not_required` from config in `planActionTransition`'s denorm block (verified slot ~L174–190, beside
`doc.access` / `doc.workflow_type`), and (b) a kind-agnostic load-phase gate in `loadWorkflowState` beside
the per-verb access gate (verified slot ~L169–176) rejecting a user-driven `not_required` off live config.
No task (1–8) covers either — Task 01 (even rewritten per #1) is resolver-validate only; tasks 3/4 are
client-side.

Consequence for band 1 specifically: Task 03 renders the `not_required` button gated on
`surface.action.allow_not_required`, but nothing persists that field onto the doc, so in band 1 the button
is **permanently hidden** and **unenforced**. That may be an acceptable band-1 stub — but it must be a
*stated* one. `tasks.md`'s "Known stubs accepted in this band" list (L28) doesn't mention it.

**Fix.** Add an engine task (persist in `planActionTransition` + load-phase gate in `loadWorkflowState`,
with unit coverage for set/absent/never-copied-forward and the gate rejecting user-driven `not_required`
off config while passing engine-driven signals). Decide its band; if it's band 2, add `not_required`
(hidden, unenforced) to band 1's accepted-stubs list in `tasks.md`.

### 7. Task 03 hedges the endpoint operator the design already decided

> **Deferred to task regeneration.** The design already fixes it (D1, `design.md:85`): the endpoint
> resolves to `_module.endpointId: { _build.string.concat: [update-action-, <action type>] }`. The
> regenerated Task 03 states it as decided, not a code-time confirm. Fixed by `/r:design-task`.

Task 03 L84 leaves `_module.endpointId` as "Confirm … is the correct resolution operator." The design
already decided it (D1, `design.md:85`: endpoint resolves to
`_module.endpointId: { _build.string.concat: [update-action-, <action type>] }`, aligning with the form
templates). Per CLAUDE.md "resolve the open question; don't defer," state it as fixed in the task rather
than a code-time confirm.

## Verified accurate (no action)

`button_signal_sources.yaml` content matches Task 3's quoted map; the `submit` `Validate` scope idiom
(`^surface\.fields\.`); nullary payload (`signal:` only, no `current_status`/`target_status`); `progress`
has no `Validate` and fires `onProgress`; page filenames are `workflow-action-{edit,view,review}.yaml` on
disk (tasks use the correct names); the denorm-block and load-phase-gate code sites D3 cites are real and
currently unfilled for `allow_not_required`.
