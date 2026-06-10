# Part 49 — `request_changes` gates on `view` OR `review`, not `review` alone

**Source rationale:** [workflows-module-concept/review/review-claude-1.md](review-fable-1.md) § Doc corrections (verified contradiction + resolution); supersedes the `request_changes` row of [Part 34 D6](../../_completed/34-action-access-model/design.md) (deviation noted here — Part 34 is read-only history). **Layer:** engine handlers + concept docs. **Size:** S. **Repo:** `plugins/modules-mongodb-plugins/src/connections/shared/phases/` + `designs/workflows-module-concept/`.

The engine's submit-time access gate maps the `request_changes` signal to the `review` verb, while the shipped view template's opt-in Request Changes button is gated client-side on the `view` verb. The two sides contradict: every viewer-without-review-role click is rejected server-side _after_ the mandatory comment modal, and on actions that declare no `review` verb at all — the case the view-bar button exists for — every click from every user is rejected. This part fixes the engine side: `request_changes` passes when the caller holds **either** `view` **or** `review` for the current app. Templates are untouched; the view-gate was correct all along.

## The semantic ruling (decided in review, Sam)

- **`review` permission gates the reviewer's _judgement_ power** — `approve` (`in-review → done`) and review-page access. That is all it gates.
- **`request_changes` is "flag a problem, send it back"** — not a judgement. Anyone who can see the action may raise it. If an app author opts the button onto the view page, everyone with `view` permission should be able to click it.
- The `review` arm of the OR exists for one edge: `review` declared without `view` is legal (lint-warned, not rejected — Part 34 D4), and a reviewer standing on their own review page must never be rejected firing `request_changes` from it.

## Proposed change

1. **`SIGNAL_VERBS` values become arrays** ([loadWorkflowState.js](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js)) — uniform shape, one correct way; no scalar/array dual handling:

   ```js
   const SIGNAL_VERBS = {
     submit: ["edit"],
     progress: ["edit"],
     not_required: ["edit"],
     resolve_error: ["error"],
     approve: ["review"],
     request_changes: ["view", "review"], // ← the change; everything else is a one-element array
   };
   ```

2. **The access gate passes when any listed verb's gate allows.** The per-verb check itself (`gateAllows`) is unchanged — `true` passes anyone, array gate requires role intersection, absent verb fails closed. The gate loop becomes: `verbs.some((verb) => gateAllows(actionConfig.access?.[currentApp]?.[verb], userRoles))`. The `access_denied` error message lists all accepted verbs (e.g. `requires one of the "view"/"review" verbs on access.{app}`), so a denial names the full set the caller failed.

3. **No template changes.** `view.yaml.njk`'s `button_request_changes` stays gated on `_state.action_allowed.view` (now simply correct, not a workaround). `review.yaml.njk` and `pages/workflow-action-review.yaml` are unchanged — the review page itself still renders only for callers passing the `review` verb, and its `request_changes` button is now also engine-passable by construction (the `review` arm).

4. **No change to `visible_verbs`, `action_role_check`, the FSM tables, or `makeWorkflowApis`.** None of them map signals to verbs — they project per-verb booleans or resolve transitions; the signal→verb mapping lives only in `SIGNAL_VERBS`.

5. **Concept-doc sweep** (the docs are the source of truth and currently disagree with each other; after this part they agree on the new rule):
   - [action-authoring/design.md](../../../../workflows-module-concept/action-authoring/design.md) Decision 3 "Interaction → required verb" table: `request_changes` row becomes `view` _or_ `review`, with a one-line note of the semantic ruling (`review` = judgement power; `request_changes` = flag-a-problem). `approve` stays `review`.
   - [state-machine/design.md](../../../../workflows-module-concept/state-machine/design.md) "Templates and buttons" view row: rewrite the justification. The current text argues `action_allowed.view`-gating as a workaround ("gating on `action_allowed.review` would dead-end the no-review-verb case"); under the ruling it is simply the correct gate. Drop the workaround framing.
   - [submit-pipeline/design.md](../../../../workflows-module-concept/submit-pipeline/design.md) Decision 3's view-row note and Open Question 1's first bullet ("`request_changes` on the `view` template — should default to reviewer-gated, state-machine review-1 finding 7"): resolved the **other** way — viewer-gated by design; record the resolution and close the bullet.
   - The matching `spec.md` lines in the three sub-designs, where they restate the verb table or the view-bar gating.

## Problem (as verified in the shipped code)

- Engine: [`loadWorkflowState.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.js) `SIGNAL_VERBS` maps `request_changes → 'review'`; the gate fails closed when the verb is absent from `access.{app}`.
- Template: [`view.yaml.njk`](../../../../../modules/workflows/templates/view.yaml.njk) `button_request_changes` renders when the author opts in (`page_config.buttons.request_changes.visible`, default `false`) AND the current stage accepts the signal AND `_state.action_allowed.view === true`.
- Composed: a viewer without a review role sees the button, opens the modal, types the mandatory comment, and gets `access_denied`. On an action with no `review` verb declared in any app block, that is **every user, every click** — the button is a guaranteed dead-end in exactly the scenario its design rationale cites. Blast radius today is zero only because the button is opt-in default-hidden; it breaks the day an author enables it.

## Accepted consequences

Consistent with the design's standing posture (buttons are UI affordance; the verb gate + FSM are the real rules — ui Decision 7):

- **Any viewer can fire `request_changes` via the API** against an action in a source state the FSM accepts (`in-review`, `done` for form/check kinds), regardless of whether the author opted the button onto any page. A viewer knocking an `in-review` action back to `changes-required` is now legal by design. Every fire carries the mandatory comment convention and logs an event — auditable.
- The review page's _access_ remains `review`-gated; only the `request_changes` _signal_ broadens. `approve` is unchanged.

## Tests

- [`loadWorkflowState.test.js`](../../../../../plugins/modules-mongodb-plugins/src/connections/shared/phases/loadWorkflowState.test.js) currently pins the old mapping at the `test.each(['approve', 'request_changes'])('signal %s requires the review verb')` block (~line 225). Split it:
  - `approve` keeps the existing requires-`review` assertions verbatim.
  - `request_changes` gains: passes with a view-only gate match; passes with a review-only gate match (no `view` declared — the lint-warned edge); rejected with `access_denied` when the caller matches neither.
- All-signals coverage of the array shape: every `SIGNAL_VERBS` entry resolves through the same `.some(gateAllows)` path (no scalar special case left behind).
- The three-runtime gate oracle (`gates.fixtures.js`) is **unchanged** — gate semantics don't move, only the signal→verb resolution above them.

## Out of scope

- Any FSM/table change — `request_changes`' source states and target are untouched.
- Any change to `approve`, `resolve_error`, or the edit-verb signals.
- Per-page or per-source-state verb resolution (e.g. "from `in-review` require `review`, from `done` require `view`") — considered and rejected in review as needless complexity; the flat OR expresses the ruling exactly.
- The query-time `visible_verbs` projection and the `action_role_check` component — they expose verb booleans, not signal permissions; pages keep choosing which bool gates which button.
