# Consistency Review 1

## Summary

Checked Part 46's full file tree (`design.md` + one review) against the review-1 decision register. All six review-1 findings were resolved/rejected and are fully propagated into `design.md` — **zero inconsistencies found within Part 46's files**. One cross-part observation (Part 40 doesn't reflect the pause/supersession Part 46 claims) is surfaced for the user; it is out of scope for this pass and appears already in flight in Part 40's own review.

## Files Reviewed

- **Design:** `design.md`
- **Supporting:** none (no key-takeaways / research / deep dives / open-questions in this part)
- **Reviews:** `review/review-1.md`
- **Tasks:** none yet
- **Plans:** none yet

## Decision Register (review-1) → propagation

| Finding                  | Decision                                                                                                                                                                                                                                                             | Landed in design.md                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| #1 (Resolved)            | Re-scope: add fourth method `GetAction`; resolve `buttons` (per-signal booleans) and `action_allowed` (per-verb bag) server-side; retire client mirror; fold the **FSM source-stage** term into D5; Part 40 paused/depends on 46; Part 39 form button bars rewritten | D5, D8, point 4/5, line 3/9, read-methods table (no `buttons` on the three overview methods), Ripples |
| #2 (Resolved)            | "This is a **port**, not reuse"; size repriced **L–XL**; name the three ported pieces (four-key `visible_verbs` bag, `_user.apps.{app}.roles` extraction, `edit > review > error > view` collapse)                                                                   | D2, line 5, "The read methods" step 2                                                                 |
| #3 (Resolved)            | Consolidation made real: client mirror `action_role_check.yaml` deleted; new read-method JS is the single implementation shared with the submit gate; only timeline YAML stays (D6 debt)                                                                             | D2, D6 ("the last remaining duplication after this part retires the client mirror")                   |
| #4 (Resolved / Rejected) | Connection-level `user: { _user: true }`, resolved per-request like `changeLog.meta.user`, read against `app_name`; **reject** per-method `checkRead`/`checkWrite` as inapplicable to a single read+write connection                                                 | line 109 (incl. explicit no-`checkRead`/`checkWrite` parenthetical)                                   |
| #5 (Resolved)            | Preserve `group.{id, status, summary}` + per-action `{type, status, message, link, visible_verbs}`; resolve back-nav as `workflow.entity_link` server-side; move `entities` map onto the connection; **no `group.link`**                                             | line 106, response table line 117, "What gets deleted" line 135                                       |
| #6 (Resolved)            | Tighten closing claim to "no client artifact reads per-workflow config **at runtime**, and no client computes access/visibility," naming the two intended exceptions (build-time `makeActionPages`, app-level `app_name`)                                            | line 15, line 138                                                                                     |

## Inconsistencies Found

None within Part 46's file tree.

Internal cross-checks that passed:

- **Four-method naming** consistent across line 3, 9, 96, and the method↔endpoint table.
- **Two distinct links** are not contradictory: `get-entity-workflows` groups carry a forward `link` (to `workflow-group-overview`), while `get-action-group-overview` deliberately carries **no `group.link`** (back-nav is the resolved `entity_link`). Both rows of the response table and lines 104/106/117 agree.
- **Buttons only on `GetAction`**: line 9, 94, and the response table all agree the three overview surfaces render navigation links, not signal buttons.
- **Deletions list** ("What gets deleted") matches the current-state reader table and the in-text deletion mentions (titles map, `action_form_configs` + resolver, `action_role_check`, `button_signal_sources` `_ref`, the `_js` config-derivation blocks, `_module.var: entities`, the three overview routines + `visible_verbs_filter.yaml`).
- **Cross-references** to Part 40 D3 ("all other buttons fixed, no config map"; `allow_not_required` validated/doc-borne) and Part 39 D3 (form `page_config.buttons.{signal}.visible` opt-out) are accurate against those parts' current designs.

## Cross-Part Observation (out of scope — surfaced, not fixed)

**Part 46 ↔ Part 40 supersession is one-directional in the docs.**

- Part 46 states: _"Part 40 now depends on Part 46 and is paused until this lands"_ (line 76) and its button design is _"superseded"_ (line 143).
- Part 40's own `design.md` still describes the full **client-side** path — `action_role_check` retained (`40/design.md:72`), `button_signal_sources.yaml` read at build time via `_ref` (`:13, :91`), client `_state` gating (`:100, :123`) — and references Part 46 only as a _future_ reopener for per-action button config (`:127, :247`), not as a hard dependency it is paused behind.

Resolving this means editing **Part 40**, which is out of scope for a Part 46 consistency pass. It also appears to be in flight already (Part 40 has uncommitted `review-3.md`, `consistency-1.md`, and modified tasks). Flagged so it isn't lost; recommend handling it in Part 40's own consistency/action-review pass.

## No Issues

- Review-vs-Design drift: none — all annotations propagated.
- Design-vs-Task / Design-vs-Plan drift: n/a (no tasks/plans yet).
- Internal contradictions: none found.
- Stale references / status / blockers: none — the design's source line-number citations were verified by review-1 on the same branch; the only "paused/blocked" note (Part 40) is current and intentional.
- Moot sections: none — D3/D4 retain only the decision + rejection rationale, not abandoned exploration.
