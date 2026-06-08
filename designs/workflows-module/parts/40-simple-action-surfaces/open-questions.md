# Open questions — Part 40 action review (paused 2026-06-05)

Status snapshot for pickup. Review-2 findings: **#1, #2, #3, #4, #5 resolved; #6 rejected** (#3 resolved 2026-06-08 — see §1).
All resolutions are annotated in `review/review-2.md` and applied to `design.md` (plus ripple
edits to Part 24, Part 33, and Part 46 OQ4). The items below are everything still pending,
with the standing recommendation and the reasoning for each.

## 1. Review-2 #3 — where `action_allowed` lives — RESOLVED 2026-06-08

**Decided: keep it namespaced under `surface.action_allowed`.** The shared `action_role_check.yaml`
keeps writing its per-verb map to root `action_allowed` (fixed — the form pages read it there); each
of the surface's callers (the three pages' `onMount` + the modal's open handler) adds a `SetState`
copying it into `surface.action_allowed`.

Rationale: the modal renders inside a host entity page's state, and the module keeps **all** its vars
in its own namespace rather than writing a module-internal key into the host's root — a structural
namespace-hygiene rule, not a per-var collision judgement. This overrides the Friday paused-session
lean toward reading root (which under-weighted host-namespace ownership at the end of a long context).
Applied to D1/D2/D5/D6 and tasks 03/04/tasks.md; annotated in review-2 #3 and review-3 #4.

Stale-caveat cleanup folded in (confirmed by review-3 #5): the "Part 34 must land before" framing in
tasks 03/04/tasks.md is cut — the per-verb `action_allowed` map shipped (commit 68b9b09,
`action_role_check.yaml` + `evaluateVerbGate.js`), and the "single `action.link`" framing is stale
post-#1 (the singular link is now legitimately server-resolved).

## 2. Part 46 reconciliation package (proposed, awaiting approval)

The Part 46 draft (`46-debundle-workflow-config/design.md`) was written in parallel with this
review session; its **buttons thread is stale** against the #2 resolution. Proposed amendments:

- **Drop `buttons` everywhere**: Proposed-change items 4–5, D5, `ACTION_FIELDS + buttons`
  (Validated config additions), and `action.buttons` in the response-additions table. Two
  reasons: (a) the requirement died — Part 40 D3 dropped per-action button config; only
  `allow_not_required` survives (doc-borne, enforced off live config at the load-phase gate);
  (b) wrong data path — the three read methods feed *list* surfaces that render no buttons,
  while the simple surface reads its action via the page/modal `get_action` request, so resolved
  booleans on the list responses would never reach it.
- **Replace D5** with a short note: button visibility resolved at Part 40 D3; record the
  re-add path if a per-action button need ever materialises (authored map back into
  `ACTION_FIELDS`, resolution in one JS function next to `evaluateVerbGate`, delivered by
  porting `get_action` to an engine read method — the natural Part 46 follow-on — or by doc
  denormalisation like `allow_not_required`). Note: D5's current example names a `cancel`
  signal that doesn't exist in the signal inventory.
- **Rewrite the Part 40 ripple**: the real cross-part edit Part 46 owes Part 40 is that Part
  40's navigation prose (surfaces section, D5, Files-changed) cites the YAML stages
  (`visible_verbs.yaml` + `resolve_action_link.yaml`) as the link-resolution mechanism for the
  three read APIs, which Part 46 replaces with engine read methods (Part 42 D5 semantics
  unchanged). Not OQ4 — that's already resolved.
- **Add a "Data placement model" section** (generalising the intro's closing rule). Four
  channels, each with a criterion; the client never reads raw config under any of them:
  1. **Baked** — block structure / per-type page chrome (framework constraint: Lowdefy blocks
     exist at build). Generated artifacts only.
  2. **Doc** (engine render-on-write) — instance state, transition-faithful rendered display
     (`message` / `status_title` are audit-semantic: rendered against the doc *at that
     transition*; read-time recompute would change meaning, not just freshness), and policy
     flags whose UX read rides the doc (`access`, `allow_not_required`).
  3. **API read-time join** (Part 46's mechanism) — current-config display: titles, icons,
     ordering, `form_meta`. Right-sized per response; config edits propagate on rebuild.
  4. **Enforcement** — always live config server-side, regardless of any display channel.

## 3. `allow_not_required` display channel on form pages (parked)

Part 40 D3's form-alignment bullet has `edit.yaml.njk` read the **baked**
`action_config.allow_not_required`; the check surface reads the **doc** flag. I earlier
proposed unifying on the doc read (single display channel — one clock, no skew). Counterpoints
since: Part 46 explicitly blesses per-type baking ("build-time, stays"), and the
same-screen-skew scenario can't occur for this key (an action is either form or check; the two
readers never show the same datum side by side). **Current lean: keep the baked read on form
pages** (i.e. drop my earlier amendment proposal) — but it's a judgement call; decide and either
leave D3 as written or flip the form-alignment bullet to the doc read.

## 4. Discovered gap — modal wiring needs a `kind` branch (D5 edit needed)

The bundled `actions-on-entity` wiring fires `simple-action-modal` for **every** clicked action,
but a form action can't render in the simple surface (no form body). The wiring must branch:
open the modal only for `kind: simple` (post-Part-43: `check`), navigate via `action.link`
otherwise. `kind` is stamped on the doc (`planActionTransition.js:147`) so the
`get-entity-workflows` response carries it — verify it survives the response projection, then
amend D5's host-wiring contract and the `actions-on-entity` Files-changed row.

## 5. `EventsTimeline.onActionClick` payload mismatch (recorded, unowned)

Already noted in design.md ("Event-timeline action items (Part 42 — shipped)"): the shipped
event fires `{ pageId, urlQuery }`, not the action object, while the modal's open contract needs
`action._id` (and now `kind`, per item 4). Someone must own the payload reconciliation — a small
Part 42 follow-up or a Part 40 task. Not yet assigned.

## 6. Housekeeping after the review closes

- **Task files are stale** (`tasks/01–08`, `tasks.md`): Task 01 (resolver/global) is dead per
  #2's resolution; Task 02 carries the old "Part 34's scope" link framing (per #1); Task 04's
  namespace-remap discussion resolves with #3; Task 07's concept-reconciliation lines still say
  `global.simple_action_buttons`. Re-run `/r:design-consistency-review workflows-module/parts/40-simple-action-surfaces`
  (design.md changed substantially), then regenerate/sweep tasks via `/r:design-task`.
- **Part 43 (rename simple→check) ordering**: this design still says "simple" throughout —
  deliberate (the rename part owns terminology) — but confirm Part 43's position relative to
  Part 40 in the implementation plan.
- **Part 46 has no review yet**: after the reconciliation package lands, run
  `/r:design-review` on it (its D1–D4/D6/D7 verified well against code in this session; the
  buttons thread was the only stale piece found).
- **Part 47** (`per-workflow-submit-endpoints`, referenced from Part 46 Related) — not read or
  verified in this session.
