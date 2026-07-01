# Task 4: Route authored cell links in `computeEngineLinks` (+ shared sentinel helper, delete dead file)

## Context

The display layer is **per-verb**. Every read surface (`GetEntityWorkflows`,
`GetWorkflowOverview`, `GetWorkflowActionGroupOverview`, `GetEventsTimeline`)
calls `collapseLink({ links: action[slug].links, allowed })`, and `collapseLink`
(`plugins/.../shared/render/resolveActionAccess.js`) reads only
`links.{edit,review,error,view}` with priority `edit > review > error > view` — it
has no concept of a singular `link`.

The planner (`plugins/.../shared/phases/planners/planActionTransition.js`) renders
the author's `status_map` cell against the planned doc and deep-merges it on
(`renderStatusMap` renders the whole cell, so `doc[slug].link` /
`doc[slug].view_link` are populated for a custom action — line 240–245), then calls
`computeEngineLinks({ action: doc, entry_id })` (line 248) and assigns the result
to `doc[slug].links` (line 249–251).

Today `computeEngineLinks`
(`plugins/.../shared/render/computeEngineLinks.js`) short-circuits custom:

```js
if (kind === "custom") return {};
```

So an authored cell `link` never reaches `doc[slug].links`, and the card is
unclickable. This is the design's #1 defect.

The `{ action_id: true }` / `{ entity_id: true }` **sentinel swap** already lives
inline in the tracker `start_link` arm of `computeEngineLinks` (lines 91–103): it
walks the cell `urlQuery`, replacing `action_id: true` → `action._id` and
`entity_id: true` → `action.entity.id`, passing static keys through.

A separate file `plugins/.../shared/render/substituteActionIdSentinel.js` is
**orphaned Part-30 dead code** — no production caller (only its own def + test),
and it handles only `action_id`, not `entity_id`.

The per-stage verb-page table `STAGE_VERB_PAGE` (lines 40–49) already records which
verbs have a meaningful page at each stage.

## Task

In `plugins/.../shared/render/computeEngineLinks.js`:

1. **Extract a shared sentinel-substitution helper** — a small function over a
   flat `urlQuery` object that replaces `action_id: true` → `action._id` and
   `entity_id: true` → `action.entity.id`, passing every other key/value through
   verbatim (and returning `undefined`/no `urlQuery` when the source has none).
   Use it in the existing tracker arm (replacing the inline loop at lines 91–103)
   and in the new custom branch below.

2. **Replace the `kind: custom` `return {}` short-circuit with routing.** For
   `kind: custom`, iterate the declared slugs (`declaredSlugs(access)`, same as
   the built-in path) and build a per-verb `links` map per slug from the rendered
   cell on the doc:

   - **Working link** — read `action[slug].link` (the rendered working cell). Land
     it in the stage's single active **working verb slot**, reusing
     `STAGE_VERB_PAGE`:
     - `edit` at `action-required` / `in-progress` / `changes-required`
     - `review` at `in-review`
     - `error` at `error`
     - at `done` (a view-only stage, no working verb) the working `link` lands in
       the `view` slot (`done: { link: ... }` reads naturally)
     - at `blocked` / `not-required` no slot is exposed → no working link (cell is
       message-only)

     Substitute sentinels via the shared helper. Honour the per-slug/per-stage
     gating consistent with the built-in path: a slot is only filled when the slug
     declares that verb in `access[slug]` **and** the stage exposes it (the slot is
     active per the mapping above). (At `done` the relevant gate is the `view`
     verb.)

   - **View link** — fill the `view` slot wherever the stage exposes `view`
     (`STAGE_VERB_PAGE[stage].view`) and the slug declares `view`, using:
     - the author's `action[slug].view_link` if present (sentinels substituted),
       else
     - the entry-scoped shared fallback
       `{ pageId: scoped(entryId, "{workflow_type}-action"), urlQuery: { action_id: action._id } }`.

     This is the observer fallback — a viewer is never dropped onto the working
     page. (Note: at `done` the working `link` and the `view` slot can coincide;
     the working `link` taking the `view` slot is the intended "done →
     view-only" behaviour. If both a `done` working `link` and a `view_link` are
     authored, prefer the working `link` in the `view` slot, matching the cell
     reading `done: { link }`.)

   Write the resulting `{ view, edit, review, error }` map (null where unfilled)
   into `result[slug]`, the exact shape `collapseLink` reads.

3. **Update the file's doc comment** — replace the `custom -> no engine links`
   line with the routing description.

4. **Delete** `plugins/.../shared/render/substituteActionIdSentinel.js` and its
   `substituteActionIdSentinel.test.js`. Confirm no remaining imports
   (`grep -rn substituteActionIdSentinel plugins/`).

## Acceptance Criteria

- `computeEngineLinks` no longer returns `{}` for `kind: custom`; it returns a
  per-slug `{ view, edit, review, error }` map.
- A custom action at `action-required` with a cell `link` → that link (sentinels
  substituted to the concrete `_id`) lands in the `edit` slot; `in-review` → the
  `review` slot; `error` → the `error` slot; `done` → the `view` slot.
- The `view` slot is the author's `view_link` when present, else the shared
  `{workflow_type}-action` page with `urlQuery: { action_id: <_id> }`, wherever the
  stage exposes `view`.
- `collapseLink` against the routed map yields the working app page for a user
  with the active working verb, and the view page (`view_link` or shared) for an
  observer with only `view`.
- The tracker arm uses the shared sentinel helper and its existing tests pass
  unchanged.
- `substituteActionIdSentinel.js` + its test are deleted; no imports remain.
- New `computeEngineLinks.test.js` cases cover the worked examples above; the full
  plugins test suite passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — modify — shared sentinel helper; custom routing branch; doc comment.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.test.js` — modify — add `kind: custom` routing cases.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/substituteActionIdSentinel.js` — delete.
- `plugins/modules-mongodb-plugins/src/connections/shared/render/substituteActionIdSentinel.test.js` — delete.

## Notes

`renderStatusMap` needs **no change** — it already renders the whole cell, so
`doc[slug].link` / `doc[slug].view_link` exist by the time `computeEngineLinks`
runs. The cell `urlQuery: { action_id: true }` is a plain boolean to `renderTree`
(no operator), so it passes through render untouched and the sentinel helper does
the swap. `planActionTransition.js` also needs no change — it already assigns
`computeEngineLinks`'s output to `doc[slug].links`.
