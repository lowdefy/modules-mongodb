# Review 4 — The post-46-flip design vs. the actual Part 46 contract

Reviews 1–3 verified the pre-46 design; the design has since been rewritten to consume
[Part 46](../../_completed/46-debundle-workflow-config/design.md)'s server-resolved read contract
(`GetAction`, per-signal `buttons`, no client role-check, namespace `surface` → `current_action`).
This pass verifies that rewrite against Part 46's **current design** (which itself went through
reviews 1–4 + consistency 1–3 after Part 40's open-questions snapshot was written), against
shipped code, and against the concept docs.

The shipped-code claims all hold (re-verified: the `workflow-action-*.yaml` line citations, the
8-step `onMount`, `ActionSteps.js:162–171` hard-Link + `:146/:170` linkless handling,
`EventsTimeline.js:404–407` `{pageId, urlQuery}` payload with no navigate-default,
`timeline_action_lookup.yaml` projecting `_id` but not `kind`, the `universal-fields.yaml` stub,
`button_signal_sources.yaml`, `action_role_check.yaml` writing root `action_allowed`,
`visible_verbs.yaml`/`resolve_action_link.yaml` in all three read APIs, `computeEngineLinks.js`
routing the check `error` verb to `workflow-action-view`, and `planSubmit.js:60` accepting a
`fields` payload key). The concept-doc claims hold too: ui Open Question 4 is still open
(`ui/design.md:577`) and state-machine's Next-step item 3 sub-question is still flagged as the
remaining open piece (`state-machine/design.md:367` + the 2026-05 note) — so this part's
reconciliation table is accurate. Part 24's design carries the `state_path` var with the
`current_action.fields` example (`24-universal-fields/design.md:42,76`) — the namespace rename
propagated there correctly.

What did **not** survive verification is the Part 46 contract itself: the design consumes an
older draft of it. Part 46's review cycle renamed and reshaped the very surface this part renders
from.

## Contract mismatches with Part 46

### 1. `GetAction` does not exist — Part 46's method is `GetWorkflowAction`, and the request is renamed `get_workflow_action`

> **Resolved (auto).** Renamed every forward-looking `GetAction` → `GetWorkflowAction` and `get_action` → `get_workflow_action` across intro, proposed-change, dependencies, D1, D2 (heading + anchor in proposed-change 3), D5, D6, Files-changed, and Tests, verified against Part 46 proposed-change 1/2 + D8. Left the pre-46 shipped-state descriptions intact: Current-state §`workflow-action-edit.yaml` (the shipped 8-step `onMount` legitimately reads `get_action`) and the Current-state note's left-of-arrow (`reroutes `get_action`→`GetWorkflowAction``, where `get_action` is the shipped request being rerouted).

The design says `GetAction` throughout (~15 references: intro, proposed-change 3/5/6, D1's state
contract, D2's heading and body, D3, D4, D5's open sequence, D6, Files-changed, both Tests
bullets). Part 46 defines no such method: the detail read is **`GetWorkflowAction`**
(46 proposed-change 1, D8), deliberately named to say it ignores `workflow_id: null` task docs
("The name now says this directly — a workflow action, not any action", 46 D8). The request id is
also renamed: `get_action` → **`get_workflow_action`** (46 proposed-change 1/2), while this design
says "the `get_action` request (now routed to `GetAction`)" (D1) and "`get_action` (now
`GetAction`, fresh…)" (D5 step 1).

Mechanical fix: rename every `GetAction` → `GetWorkflowAction` and every "request `get_action`" →
`get_workflow_action`. While there, the D5 citation "`GetEntityWorkflows`'s projection adds both
([Part 46] todo item E)" can cite Part 46's design directly — the `_id`/`kind` addition is now
baked into its response-additions table (46 "The read methods", `get-entity-workflows` row), not
just the todo file.

### 2. The per-verb bag is named `allowed`, not `action_allowed`

> **Resolved (auto).** Renamed the response-bag references `action_allowed` → `allowed` (intro, proposed-change, dependencies note, D1 state contract, D2, D5 mode derivation + open sequence); the `current_action.action_allowed.*` reads become `current_action.allowed.*` (the spread lands the response field `allowed` there with no remap, per Part 46 D8). Left three historical/cross-part references as-is: the binary-model note (Part 24/39 "still reference the binary `action_allowed`"), the retired-mirror description in D1 ("a copy from root `action_allowed`"), and the Part 34 Related line ("per-verb `action_allowed` (D8)" — Part 34's own access-grammar naming, not this part's response read).

Part 46 standardises the bag name: "the same bag under the same name (**`allowed`** — one name
across every method that surfaces it, **replacing today's `visible_verbs` on the overview APIs
and `action_allowed` in the client mirror**)" (46 proposed-change 5), and D8's consequences spell
out the migration: "every consumer that today reads `_state.action_allowed.*` reads the renamed
response field `allowed` instead — audit all consumers."

This design reads `action_allowed` everywhere it touches the response: proposed-change items 5–6,
the Part 34 dependency note ("now surfaced via `GetAction`"), D1's state contract
(`current_action.action_allowed.edit`), D2 ("it stays available on the response"), D5's mode
derivation (`action_allowed.review` / `action_allowed.edit`), and D6. Under the actual contract
these are `current_action.allowed.{verb}`. Rename throughout, and note in D1 that `allowed` is the
response field name (so the spread lands it at `current_action.allowed` with no remap).

### 3. `get_workflow` is deleted by Part 46 — but the closed banner and `required_after_close` gate still need the workflow stage

> **Resolved.** Gap is real, but the Part 46 amendment this finding proposed has since landed independently: Part 46 review-5 #1 added a resolved **`workflow_closed`** boolean to the `GetWorkflowAction` envelope (`workflow.status[0].stage ∈ {completed, cancelled}`, computed from the parent-workflow read it already does), and named Part 40's review banner as a consumer. So no Part 46 flag is owed. Resolved Part 40-side only: D5 step 2 collapses to one read (banner + `required_after_close` gate read the resolved `current_action.workflow_closed` + `current_action.required_after_close` off the single response); D6 drops `get_workflow` from the carried-over requests and moves it under "Gone (deleted by Part 46)"; D1 state contract lists `current_action.workflow_closed` among the spread top-level fields. Part 46 chose the resolved boolean over folding the gate into `buttons`, so the page keeps a trivial `workflow_closed ∧ ¬required_after_close` gate (matching how 46 left the form templates).

D5's modal open sequence step 2 runs "`get_workflow` → drives the workflow-closed banner and the
`required_after_close` gate", and D6 lists "the `get_action` (now `GetAction`) / `get_workflow`
requests" under what carries over unchanged. Part 46 explicitly **deletes**
`requests/get_workflow.yaml` ("What gets deleted": it is "the second detail-path request… the four
form templates… drop their `get_workflow` step and read submitted values off the single
`GetWorkflowAction` response"; also an "ungated raw `$match`" 46 wants closed).

The collision is real, not just naming: the shipped closed-banner/gate reads the **workflow's**
stage (`workflow-action-edit.yaml:96,99,180,183` — `_request: get_workflow.status.0.stage`), and
Part 46's curated `GetWorkflowAction` envelope (46 D8) carries `required_after_close` but **no
workflow stage** — 46's deletion analysis only accounted for the `form_data` read. So as the two
designs stand, the check pages and the modal have no data source for the closed banner or the
gate.

Proposed fix, in two parts:

- **Part 46 amendment (flag to its design):** `GetWorkflowAction` already reads the parent
  workflow doc (for the `form_data` slice), so it should expose the workflow stage on the
  envelope (e.g. `workflow_status`) — and since workflow-closed is read-time-knowable in the same
  method, consider folding the closed-∧-not-`required_after_close` term into the server-resolved
  `buttons.{signal}` booleans too (it is the same staleness class as the FSM stage term, and it
  completes "clients render dumb"; the banner still needs the stage field for display). Note the
  four form templates have the identical gap — 46's own form-template rewiring breaks their
  banner/gate the same way.
- **This part:** rewrite D5 step 2 and D6 to read the closed state off the single
  `GetWorkflowAction` response (`current_action.workflow_status`, or nothing at all if 46 folds
  the gate into `buttons`), and drop `get_workflow` from the carried-over list.

### 4. Part 46 D6 deletes `timeline_action_lookup.yaml` in Part 46 itself — the "leaves the YAML stages on the timeline path" framing and the `kind`-projection edit are dead

> **Resolved.** Confirmed against Part 46's current D6 + "What gets deleted": all three shared YAML stages are deleted in Part 46 (zero stragglers), and `GetEventsTimeline` projects `{_id, kind, status, link, message, …}` with `_id`/`kind` added expressly because the timeline is a check-modal host. So Part 40 owns no data-side timeline edit. Rewrote the Surfaces parenthetical (line 32) and Out-of-scope bullet to "ported into `GetEventsTimeline` and deleted by Part 46 D6"; replaced the dead `timeline_action_lookup.yaml` `kind`-projection bullet in the Event-timeline section with a "Data path (no Part 40 edit)" note; converted the Files-changed row to a "moved to Part 46" entry; fixed the D5 branch-feeding note so both `GetEntityWorkflows` and `GetEventsTimeline` supply `_id`/`kind` (also dropping the stale "todo item E" citation for Part 46's design table per #1's secondary note). The block-side convergence (`EventsTimeline.js` fires the action object, navigate-by-default, linkless suppression) survives unchanged as this part's work.

Three places in this design describe an older Part 46 D6 in which the timeline port was a
follow-up:

- Surfaces section: "[Part 46 D2] ports it into the engine read methods for the entity/overview
  reads, **leaving the YAML stages on the timeline path only — D6**."
- Event-timeline section: "`timeline_action_lookup.yaml` … **gains `kind`** … (a small edit to the
  shipped Part 42 lookup, **which Part 46 D6 leaves in place until the timeline-port
  follow-up**…)" — plus the matching Files-changed row.
- Out of scope: "the timeline read's full engine-method port **stays deferred** ([Part 46 D6])."

Part 46's current D6 says the opposite: "the timeline port (D6) is in scope, so **all three YAML
stages are deleted in this part, not left behind**" — `timeline_action_lookup.yaml`,
`visible_verbs.yaml`, and `resolve_action_link.yaml` all go ("zero stragglers"), the events
module's inline splice is removed, and the action-enriched timeline becomes the workflows-provided
`GetEventsTimeline`, whose cards **already project `{_id, kind, status, link, message, …}`** —
"`_id`/`kind` included because the timeline is a check-modal host (Part 40)" (46 "The read
methods").

Fix: delete the `timeline_action_lookup.yaml` Files-changed row and the `kind`-projection edit
(46 supplies both fields); rewrite the Surfaces parenthetical and the Out-of-scope bullet to
"ported and deleted by Part 46 D6"; in the Event-timeline section, state that the timeline host's
data path post-46 is `GetEventsTimeline` (the block-side convergence — `onActionClick` firing the
action object, the navigate-default, linkless suppression — survives unchanged as this part's
work; only the data-side edit dies).

## Internal design issues

### 5. D2's concurrency parenthetical contradicts Part 38 D13(3) — a stale button click throws, it doesn't no-op

> **Resolved.** Rewrote the D2 parenthetical: a stale button click is a user-driven signal, so per Part 38 D13(3) it **throws** `WorkflowEngineError` (the no-op path is cascade/mirror-only) rather than resolving to an undefined cell and no-opping. Framed the throw as the accepted outcome for the rare read-skew race (the read was honest when rendered). Per "build for what exists," added **no** bespoke per-signal error handling — the error surfaces through the signal call's standard error path, consistent with the form templates' signal calls (which specify none).

D2 first states the throw policy correctly: "a **user-driven** signal with no FSM entry
**throws**, so a button shown from an incoherent stage would surface a user error." Two sentences
later: "Buttons the server marks `false` are still FSM-checked at submit (a concurrent stage push
the read didn't see **resolves to an undefined cell and no-ops**)." Both sentences describe the
same event — a user clicking a button — and Part 38 D13 is unambiguous: "user signals throw,
cascade signals no-op" (38 design.md:58; the no-op path is reserved for cascade/mirror signals,
38 D3 `planTrackerLevel`). So the read-skew race ends in a thrown `WorkflowEngineError` surfaced
to the user, not a silent no-op.

Fix the parenthetical: a concurrent stage push means the submit throws the engine's
invalid-signal error; say that this is the accepted outcome for the race (the read was honest when
rendered) and, if the surfaces should present it gracefully, where the error lands (the `CallAPI`
error path / a message toast) — the design currently specifies no error handling for any signal
call.

### 6. `resolve_error` needs the comment field, but D1's `view` mode doesn't render one

> **Resolved.** Added "+ comment (only at stage `error`, for the `resolve_error` recovery note — binds `current_action.comment`)" to the `view` row of the D1 mode table, so the recovery note has an input and `resolve_error`'s `comment` payload is populated (the modal inherits it via the shared `_ref`). Confirmed orthogonal to Part 24: the comment is Part 40's own `TiptapInput` (not Part 24's universal-fields component), and the universal fields correctly stay read-only in `view` mode (Part 24 `display` mode) — recovery edits only the comment, consistent with check fields being written on `submit`, not on the view surface. (Noted separately: Part 24 has its own pre-rename/pre-46 drift — `state_path: surface.fields`, `action_role_check`/`_state.action_allowed` — for a Part 24 consistency pass, not this finding.)

D4: "`resolve_error` reuses the comment field (recovery note) and fires the standard payload"
(whose `comment:` term reads `_state: current_action.comment`). But D1's mode table gives `view`
mode "header + universal fields (read-only) + status-history" — no comment input. As specified,
the recovery note has no input to be typed into, and `comment` is always empty on `resolve_error`.

Fix: render the comment input in `view` mode conditionally when the stage is `error` (exactly when
`resolve_error` renders), and record it in the D1 mode table. (The modal inherits the fix for free
since it `_ref`s the same surface.)

### 7. One payload shape for all six signals lets review-verb submits overwrite concurrently edited fields

> **Resolved.** Made the D1 payload per-signal: a base payload (`action_id`/`signal`/`current_key`/`comment`) on every signal, with `fields` added on `submit` and `progress` only — the two edit-mode signals where the universal fields are the live submission content. `approve`/`request_changes`/`resolve_error`/`not_required` omit `fields`, so a stale open-time seed can no longer clobber a concurrent editor's change. `comment` stays on all signals (fresh per-transition note, never an overwrite — contrasted explicitly in the design). **Related decision:** the reassign-without-transition need this surfaced is served by Part 24, not by adding fields back onto more signals — Part 24's shared universal-fields component now ships **one Update operation for every kind** (no check special-case), so independent field edits (e.g. reassigning a `done` check action) go through that operation. Part 24's design updated to capture the requirement. Downstream Part 40 follow-up (not in this finding): the check surfaces must expose that shared Update affordance so reassign-without-transition is reachable.

D1 specifies a single nullary payload carrying `fields: { _state: current_action.fields }` for
every signal, including `approve`, `request_changes`, and `resolve_error`. The engine applies
`payload.fields` onto the doc on **every** transition (`planActionTransition.js:170` —
`...payload.fields` is spread into the updated doc unconditionally, and `planSubmit.js:60` passes
`params.fields` through for the user entry). In `review`/`view` modes the fields are a read-only
seed taken at open time — so a reviewer who has the surface open while an editor changes
`due_date`/`assignees` will silently revert those changes on Approve.

The form templates already model the fix: their payloads differ per signal (`submit`/`progress`
carry `form:`; `not_required` carries only `action_id`/`signal`/`current_key`/`comment` —
`edit.yaml.njk:254–265, 358–365`). Mirror that here: only the edit-verb signals (`submit`,
`progress`, `not_required` if fields should persist on skip — arguably also not) send `fields:`;
`approve`/`request_changes`/`resolve_error` send `action_id`/`signal`/`current_key`/`comment`
only. Update the D1 payload block from "each button's payload" to a per-signal table or a stated
rule (fields ride edit-verb signals only).

### 8. Minor: the review page's stale-URL allowlist still admits `error`, which is now a buttonless dead end

> **Resolved.** Dropped `error` from the `workflow-action-review` stale-URL allowlist in D6 (`[in-review, error]` → `[in-review]`). A check action at `error` renders no review buttons (`approve`/`request_changes` are false outside `in-review`; `resolve_error` is view-mode only, D4) and the engine routes the `error` verb to `workflow-action-view`, so the guard now redirects an `error`-stage hit to the view page where recovery lives instead of stranding it on a buttonless render. Left the Current-state description of the shipped `[in-review, error]` guard intact (it documents pre-rewrite state).

D6 carries the `workflow-action-review` stale-URL guard over unchanged with its shipped allowlist
`[in-review, error]`. Under this part's own model, stage `error` on the review page renders no
buttons at all (`buttons.approve`/`buttons.request_changes` are false outside `in-review`/`done`
per `button_signal_sources.yaml`, and `resolve_error` renders only in `view` mode per D1/D4), and
the engine's link table routes the `error` verb to `workflow-action-view`
(`computeEngineLinks.js:117–120`). Keeping `error` in the review allowlist strands a
reviewer-bookmarked URL on a page with nothing to do. Either drop `error` from the review
allowlist (the guard's redirect sends them to the view page where recovery lives) or state why a
buttonless review render at `error` is preferred. Small, but D6 currently presents it as a
deliberate carry-over rather than a leftover.

## Supporting-file staleness

### 9. The regenerated task files predate the Part 46 flip and contradict the current design

> **Resolved.** Confirmed stale on every axis the flip changed, and now further out of sync after this session's findings 1–8 + the Part 24 reassign decoupling. Rather than hand-patch, **deleted all nine task files** (`tasks/tasks.md` + `tasks/01–08`) so no one works off them, and deferred to `/r:design-task` regeneration. Sequence: run `/r:design-consistency-review` first (design.md changed substantially this session), then regenerate tasks — with findings 1–8 as the spec for what the regenerated tasks must not carry.

`tasks/tasks.md` and tasks 01–08 were regenerated against the pre-46 design and are stale on
every axis the flip changed:

- **Task 1** (`01-allow-not-required-policy.md`) implements validate (`makeWorkflowsConfig`) +
  persist (`planActionTransition`) + enforce (`loadWorkflowState`) + form alignment in **this
  part** — the design moved all of that to Part 46 (D3, Files-changed: "Moved to Part 46…; not in
  this part"), and the doc-persist was **dropped entirely** ("no doc-persist-for-display is
  needed", D3).
- **Namespace**: tasks read `surface.*` (`surface.fields`, `surface.action_allowed`,
  `surface.action.allow_not_required` — tasks.md:24,40,49); the design's namespace is
  `current_action.*` with no `allow_not_required` doc read at all (the button is
  `current_action.buttons.not_required`).
- **Task 3 / Band 1 rationale** consume "the **shipped** `enums/button_signal_sources.yaml` enum
  … and the **shipped** per-verb `action_role_check` map" (tasks.md:26) plus the root→surface
  `SetState` copy (tasks.md:49) — all three are deleted/retired by Part 46; the surface reads
  server-resolved `buttons`/`allowed` (D1/D2).
- **"Known open items"** (tasks.md:53–54) lists the `kind` branch and the `EventsTimeline`
  payload as unresolved — the design resolved both (D5 wiring; the convergence section).
- **Sequencing**: Band 1 "runs after Part 39 and Part 24" with "no cross-wave migration pending"
  (tasks.md:40,49) — the design is paused on Part 46 and its tasks must sequence after it.

Per open-questions §6 precedent, regenerate via `/r:design-task` once this review's findings are
resolved; this finding plus findings 1–4 are the spec for what the regenerated tasks must not
carry.

### 10. `open-questions.md` records superseded positions on the three threads the 46 flip closed

> **Resolved.** The whole file was a closed pause-pickup snapshot: §1/§4/§5 resolved, §2/§3 superseded by Part 46 (§2's "drop `buttons`" / "leave YAML stages on the timeline" amendments went the opposite way and were stale per #4), §6 housekeeping (its task-staleness item closed by #9). Live decisions now live in design.md + these annotations, and nothing references the file (verified against design.md, Part 46, and the parent). **Deleted `open-questions.md`** rather than keep a tombstone — same call as the task files (#9).

The snapshot file contradicts the design it supports:

- **§2** proposes the Part 46 reconciliation package "drop `buttons` everywhere" because "the
  three read methods feed _list_ surfaces that render no buttons". Part 46 went the other way:
  button resolution attaches to the **detail** read `GetWorkflowAction` (46 D5/D8) — exactly the
  path §2 said couldn't carry it — and the design now consumes that. §2 also proposes the
  "leaving the YAML stages on the timeline path" ripple that finding 4 shows is stale.
- **§3** parks the form-page `allow_not_required` display channel with a lean toward the baked
  read. Part 46 D5 resolved it: the form's `not_required` term reads the server-resolved boolean,
  and `page_config.buttons.not_required.visible` flips to a default-`true` opt-out — which D3's
  form-alignment bullet already states.
- **§1** records the `surface.action_allowed` + trailing-`SetState` decision; D1 now explicitly
  supersedes it ("No client role-check (supersedes review-2 #3) … the earlier trailing-`SetState`
  workaround … is retired entirely") and the namespace is `current_action`.

Annotate each section with its outcome (or rewrite the file as a closed log) so the next reader
doesn't take §2's Part 46 amendments or §1's remap decision as current.

## Verified accurate (no action)

All shipped-page/block/stage line citations (intro list above); ui OQ4 and state-machine
Next-step 3 genuinely still open, so the reconciliation table is correct; Part 24 carries
`state_path` with the `current_action.fields` example; Part 38 review-14 #1/#4 and task 18 match
the D4 narrative (the rebuilt link table initially pointed the check `error` verb at a nonexistent
page; shipped code now routes it to `workflow-action-view`); Part 39's "Check actions are
separate" hand-off, `onProgress`, and the `not_required` opt-in rationale; Part 42 D5's
server-side link collapse and the shipped `EventsTimeline.onActionClick` payload mismatch this
part converges; Part 34 D6/D7/D8/D9 as cited; Part 46 D2/D4/D5/D8 as cited (modulo the names in
findings 1–2); the engine accepts a `fields` payload key (`planSubmit.js:60`), so D1's payload
grammar is valid for the edit-verb signals; `allow_not_required`/`buttons` resolution correctly
absent from shipped code (still Part 46 work); the `Modal`/`setOpen` open contract and the
single-instance blockId rule.
