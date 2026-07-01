# Review 2

Reviewed after all eight findings in review-1 were resolved. The design is in good shape — status resolution moving into the component, the `components/` vs raw `enums/` distinction, the separate-eyebrow rationale, and the loading mechanism are all sound and verified against source. Three remaining issues, all concrete; the first two are real defects (one a source-of-truth disagreement with the tasks, one a layout-geometry gap that neither the design nor the task fully closes).

## Correctness

### 1. The primary worked example gates `loading` on a request that doesn't exist

> **Resolved (auto).** Changed the workflow-overview worked example (design.md) to `loading: { _not: { _state: workflow } }`, matching the CallAPI+SetState page (verified: no `get_workflow_overview` request exists). Expanded the "Loading is opt-in" decision to spell out both gating forms — `_not: { _request: <id> }` for request-backed pages, `_not: { _state: <key> }` for CallAPI+SetState pages — bringing the design in line with task 3/4/8.

The headline "Status-driven page (workflow overview)" example (design.md:88–100) wires:

```yaml
loading:
  _not:
    _request: get_workflow_overview
```

But `workflow-overview.yaml` has **no `get_workflow_overview` request**. It loads via `CallAPI` → `SetState` into `_state.workflow` (verified: `modules/workflows/pages/workflow-overview.yaml:51–63` — `id: call_get_overview`, `type: CallAPI`, `endpointId: get-workflow-overview`, then a `SetState` to `_state.workflow`). There is no request to gate on.

Task 3 already caught this and corrects it to `loading: { _not: { _state: workflow } }` (`tasks/03-migrate-workflow-overview.md:26,36`), explicitly noting _"Do not reference a non-existent `get_workflow_overview` request."_ So the **task contradicts the design**, and per CLAUDE.md "Designs are the source of truth" the design is the one that's wrong here. The same applies implicitly to group-overview, which task 4 gates on `_state.group`.

This matters because the worked example is the canonical thing an implementer copies, and the design's own framing (design.md:37 — "letting data pages pass `loading: { _not: { _request: get_contact } }`") leans on `_request` as the universal pattern. It isn't: contacts/activities/user-admin view pages _do_ have requests (`get_contact`, `get_activity`, `get_user` all exist as `requests/*.yaml`), but the two workflow pages use CallAPI+SetState and must gate on `_state`.

**Fix:** Change the workflow-overview worked example (design.md:97–100) to `loading: { _not: { _state: workflow } }`, and add one sentence to the "Loading is opt-in" decision (design.md:37) noting the gate is `_not: { _request: <id> }` for request-backed pages **or** `_not: { _state: <key> }` for CallAPI+SetState pages (workflow overview/group overview). Task 8's README guidance (`tasks/08…md:22`) already states both forms — the design should match.

## Layout

### 2. "Eyebrow as a sibling block above the title" is geometrically impossible in the current row — it needs a column wrapper, and the task offers an incorrect alternative

> **Resolved.** Updated Implementation shape (design.md) to mandate a **column** wrapper (`layout.direction: column`, small `gap`) around `[eyebrow, title/subtitle block]`, with the `flex: 1 0 auto` moved off the title `Html` onto that wrapper — the only structure that puts the eyebrow above the title in the horizontal outer row while keeping it outside the skeletoned block. Removed the incorrect "or the eyebrow as a preceding sibling" alternative from task 2 and replaced it with the column-wrapper instruction.

The design resolves the eyebrow as "its **own** block above the title/subtitle block (not folded into it)" (design.md:165), and the visual spec says it "sits directly above the title" (design.md:156). But the title-block's outer `Box` lays its children out **horizontally**:

- The block is a plain `Box` with no `layout.direction` (`title-block.yaml:1–4`). Verified in source: a Lowdefy area with no `direction` renders as `.lf-row`, whose CSS is `display: flex` with no explicit `flex-direction` → the CSS default `row` (`@lowdefy/layout/dist/grid.css` `.lf-row`; `deriveLayout`/`Area.js` only set `flexDirection` when `direction` is supplied).
- Consistent with the existing children: back button (`flex: 0 0 auto`), badge ("to the left of the title", `selfAlign: stretch`), title (`flex: 1 0 auto`), page-actions (right). These are unambiguously a row.

So a _bare preceding sibling_ eyebrow lands **to the left of** the title, not above it. The only structure that produces "eyebrow above title" is a **column wrapper** (`layout.direction: column`) around `[eyebrow, title/subtitle block]`, with that wrapper carrying the `flex: 1 0 auto` the title block has today.

Task 2 (`tasks/02…md:64`) half-sees this but states it as a free choice: _"a wrapping column box around eyebrow + title block, **or the eyebrow as a preceding sibling** — choose whichever keeps the eyebrow outside any block that carries loading."_ The "preceding sibling" option satisfies the skeleton-isolation guarantee (review-1 #2) but **fails the visual spec** — it renders left-of, not above. Both criteria must hold simultaneously, and only the column-wrapper option does.

**Fix:** State in design.md:165 (Implementation shape) that the eyebrow and the title/subtitle block are wrapped in a **column** box (`layout.direction: column`, small `gap` for the ~2px eyebrow→title spacing), and that this column wrapper takes the `flex: 1 0 auto` currently on the title `Html`. Remove the "or the eyebrow as a preceding sibling" alternative from task 2 — in a row parent it's wrong.

### 3. The status pill needs an explicit `selfAlign: middle`, or it stretches to full height — contradicting "chunky, not full-height"

> **Resolved.** Added to the Implementation-shape "Status pill" bullet (design.md) and task 2's pill bullet that the pill block carries `layout.selfAlign: middle` — the row's default cross-axis alignment is stretch (the old badge relied on it), so the pill would otherwise reproduce the full-height look. Noted per-block `selfAlign` over a row-wide `align: middle` to avoid re-centring the back button and page-actions.

The design replaces the badge with a pill that is "chunky, vertically centred (not full-height)" (design.md:158; task 2 AC: "vertically centred — not `height: 100%`"). But the row's default cross-axis alignment is **stretch**: the outer Box sets no `layout.align`, and `Area.js` maps an unset align to `undefined` → CSS `align-items: normal` ≈ stretch (the current badge relies on exactly this, adding `selfAlign: stretch` to fill height). A pill block that doesn't opt out will therefore stretch to the full row height — the very full-height look the design is moving away from.

Neither design.md nor task 2 specifies the mechanism — they describe the _outcome_ ("vertically centred") but not that the pill block must carry `layout.selfAlign: middle` (or the outer row must set `align: middle`). This is the kind of detail that gets dropped on implementation and silently reproduces the old full-height pill.

**Fix:** Note in the Implementation-shape "Status pill" bullet (design.md:166) that the pill block carries `layout.selfAlign: middle` so it centres against the taller eyebrow+title column instead of stretching. (Per-block `selfAlign` is preferable to a row-wide `align: middle`, which would also re-centre the back button and page-actions.)
