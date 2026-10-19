# Action fields header

The workflow action pages render an action's universal fields (`assignees`, `due_date`) as a chip strip in the page title bar (`components/universal-fields/universal-fields-chips.yaml`, composed by every action template into the layout `page_actions` slot). Today the strip is unlabelled, its avatars are a flat non-interactive group, its due-date pill has no colour (so it blends into the header background), and when nothing is set the whole strip collapses to a lone pencil — which reads as lost. This part relabels and restructures the strip into two labelled fields with real empty states, gives the due pill a due-aware colour, and makes each assignee avatar a hover-named link to the contact page (matching the events timeline).

## Proposed change

1. **Inline labels, one row (Option A).** The strip becomes `Assignees {avatars} │ Due {pill} ✎` — each field carries a small uppercase label, separated by a thin divider, with the ✎ edit button anchored at the end. Layout unchanged: still the title-bar `page_actions` slot, still gated on the action declaring universal fields.
2. **Real empty states (Option X).** When there are no assignees, the field shows muted italic `Unassigned` text instead of hiding the avatars; when `due_date` is null it shows a dashed `No due date` placeholder pill. The label and the ✎ are always present, so the strip never collapses to a bare icon.
3. **Due-aware pill colour (Option C), fixing the blend bug.** The due pill's colours are set **explicitly** (no reliance on the antd default that currently makes it invisible): a neutral grey pill normally, switching to the shared `action_statuses` **`error`** palette (red) when the action is **overdue** — `due_date` is before today _and_ the action is not in a terminal stage (`done` / `not-required`). Completed actions never show red.
4. **Assignees as a hover-named, linkable avatar stack — config, no plugin.** The single core `Avatar` _group_ block (which exposes only one `onClick` for the whole group — no per-avatar tooltip or link) is replaced by a Lowdefy `List` over the `assignee_docs` array that is **already in state** on every consumer. Each item renders the stock `Avatar` block wrapped in a `Tooltip` (hover name) with an `onClick` → `Link` click-through to the contact page; items past `maxCount` collapse into a `+N` pill. All of it lives in the one shared `universal-fields-chips.yaml`, so there is nothing to rebuild per page and no new plugin surface.
5. **Contact-link wiring — cross-module page ref, no var.** Each assignee avatar's `onClick` fires a `Link` action to the contacts module's `view` page, resolved structurally via `_module.pageId: { id: view, module: contacts }` (workflows already declares a `contacts` dependency) with `urlQuery: { _id: <assignee _id> }` — `_id` is the query key the contacts view reads (`_url_query: _id`). The link is **always on**: there is no `contact_page_url` var and no `{id}` string substitution. Assignees resolve on the contacts view via the shared `user_contacts` model (see Non-goals). Trade-off: this hardwires the target to the contacts view (apps can't redirect avatars to a different person page or turn the link off) and promotes `contacts` from a soft dependency — today "only exercised when a workflow form uses contact fields" — to a build-time dependency of the always-present chips. Accepted as the "one correct way" over a configurable URL string, since workflows already depends on contacts.

## Why a List, not a new plugin block

An earlier draft proposed a new display-only `ContactAvatars` plugin block, on the reasoning that a pure-config `List` would need `assignee_docs` seeded into state and re-seeded after every refetch. That premise is false: **the docs are already in state**. The chips today read `_state: action.assignee_docs` (form templates) / `_state: current_action.assignee_docs` (check + `action` pages), and that state is seeded on mount and re-seeded on refetch by the same `SetState action / current_action` the chips already depend on (the universal-fields modal's `on_complete` re-runs `get_workflow_action`). A `List` bound to that same path is reactive for free — no new plumbing, no staleness risk.

The other stated blocker — per-avatar tooltip and link being impossible in stock blocks — also doesn't hold. The `Tooltip` block (`@lowdefy/blocks-antd`) wraps a child and shows a hover title, and the `Avatar` block fires an `onClick` event that a `Link` action turns into a contact click-through. The assignee docs already carry `profile.picture` (a pre-generated gradient SVG) with an initial fallback, exactly as today's display group renders them.

So the strip is composed from stock blocks — `List` → `Tooltip` → `Avatar` + `Link` — authored **once** in the shared `universal-fields-chips.yaml`. Under "build for concrete needs, not speculation," a new React block (with its schema, meta, exports, and a shared-renderer refactor) isn't warranted when stock composition renders the same strip and the only non-trivial part (`+N` overflow) sits in a single file. The `Avatar` visual is the same block user-account's `user-avatar` chip already wraps; the two surfaces stay consistent by using the same block, not by sharing a bespoke renderer.

**Trade-off accepted:** the chips and the events timeline render avatars through different code paths (stock `Avatar` block vs. the timeline's own React `Avatar`), so the two are not guaranteed pixel-identical. Visual parity across those two surfaces was a nice-to-have, not a requirement, and isn't worth a plugin block to secure.

## Current state

`universal-fields-chips.yaml` is a `Box` (row) composed into `page_actions` by `edit`, `view`, `review`, `action`, and `error` templates plus `check-action-surface.yaml`. It renders, left→right:

- **Assignees** — a single `Avatar` block in _group_ mode; the `avatars` array is computed by `_js` from `action_data.assignee_docs` (entries `{ _id, profile: { name, picture } }`, where `picture` is a pre-generated gradient SVG). Hidden entirely when there are no docs.
- **Due date** — a `Tag` with `icon: AiOutlineCalendar` and the formatted date. **No `color` set** → antd v6 renders its faint default, which blends into the header (the reported "not showing" bug). Hidden when null.
- **Edit ✎** — a text `Button`, always present, opens `universal_fields_edit_modal`.

There are no labels, so with both fields empty only the ✎ survives.

Two other surfaces already render single contact avatars: user-account's `user-avatar` component (a `Box` wrapping the stock `Avatar` block + an optional inline name, used by menus and single-user chips) and the events timeline's own React `Avatar` (image/initials + `Tooltip` + optional `<a href>`). Neither is a _group_ with overlap/overflow, so neither is reused wholesale here; the chips compose the same underlying stock `Avatar` block that `user-avatar` wraps.

## The assignees List

The assignees field in `universal-fields-chips.yaml` becomes a Lowdefy `List` whose `id` is the state path the consumer already holds the docs at (`action.assignee_docs` or `current_action.assignee_docs`, passed as a build-time var so each consumer binds its own path). The list renders left→right as an overlapping stack:

- **Per item** — a `Tooltip` (title = `_state: {docs}.$.profile.name`) wrapping the stock `Avatar` block. `Avatar` `src` = `{docs}.$.profile.picture` (the gradient SVG), with the name's initial as the `content` fallback; a small negative left margin gives the overlap.
- **Link** — the `Avatar`'s `onClick` fires a `Link` action to the contacts `view` page: `pageId: _module.pageId: { id: view, module: contacts }`, `urlQuery: { _id: _state: {docs}.$._id }`. `_module.*` resolves in the chips file's own (workflows) module context, so the ref lives entirely in the shared `universal-fields-chips.yaml` — consumers pass nothing for it. Cross-module page resolution replaces any URL string; the link is always wired.
- **Overflow** — items with `_index ≥ maxCount` (default 5) are hidden (`visible: _lt: [{_index: 0}, maxCount]`); a trailing `+N` `Avatar`/`Tag` shows `length − maxCount`, visible only when the count exceeds `maxCount`.

No state seeding is added — the `List` binds to the array the chips already read reactively. No events beyond the optional per-avatar `Link`.

## Due pill — due-aware colour + bug fix

The due `Tag` gets explicit colours via `styles.element`, computed by a runtime `_if` on an `overdue` flag (this both fixes the blend bug — colours are now pinned — and implements Option C):

- **Not overdue** → neutral grey pill (light grey background + border + dark-grey text; visible against the header).
- **Overdue** → the shared `action_statuses` **`error`** palette (`color` `#fff1f0` background, `borderColor` `#ff7875`, `titleColor` `#cf1322`) — no new colour convention.

`overdue` is computed in the chips from `action_data.due_date` and the action's current stage:

```
overdue = due_date is set
          AND stage ∉ { done, not-required }   # terminal stages never show red
          AND due_date < start-of-today          # day granularity
```

Only `done` and `not-required` are exempt — every other stage stays eligible for the red pill, **by design**. Overdue means "should have been done by now": a past-due action in any non-terminal stage represents work that should have completed, including `blocked` (a blocker that outlived the due date is itself the thing that should have been resolved) and `error`. The red overdue pill can therefore sit beside a red `error` status pill; that double-red is accepted rather than special-cased away — a uniform rule is easier to reason about than a bespoke exclusion list.

Because a stored date vs. "today at day granularity" comparison is awkward with comparison operators, this is a small `_js` leaf (per the js-operator guide — operators would nest badly here). It reads `action_data.due_date` + a new `action_data.stage` leaf, so it recomputes automatically on refetch. Each consumer passes that `stage` leaf alongside the existing `assignee_docs` / `due_date`, and there are **two** state-path families:

- The four **form** templates — `edit` / `view` / `review` / `error` — hold the loaded action under `action.*` and pass `stage: _state: action.status.0.stage`.
- The two **converged** consumers — `action.yaml.njk` **and** `check-action-surface.yaml` — hold it under `current_action.*` and pass `stage: _state: current_action.stage`. Wiring `action.*` into these resolves to nothing, so `overdue` would silently stay false and the pill would never go red.

The converged consumers read the **`current_action.stage` scalar**, not `current_action.status.0.stage`. Both surfaces seed and reseed that scalar in the same `SetState` that spreads the response (`action.yaml.njk` lines 165 / 460; `check-action-surface.yaml` line 602), and it is the canonical stage source the check surface already reads for its status pill and error-stage comment gate (D4). Re-deriving `status.0.stage` for the overdue leaf would introduce a second, differently-refreshed read that can go stale if a reseed touches only the scalar — the exact divergence the scalar was created to avoid. (`action.yaml.njk`'s status _pill_ happens to read `status.0.stage` directly; since it reseeds `current_action` and `current_action.stage` together they can't diverge, so that pre-existing quirk is left untouched.)

## Labels & empty states

The chips `Box` becomes a labelled two-field row (`layout.direction: row`, `contentAlign: center`, `gap`), per field gated by the existing `show` array:

- **Assignees**: `Assignees` label → the assignees `List` (stock `Avatar` stack) when `assignee_docs` is non-empty, else muted italic `Unassigned` (`Paragraph`, `type: secondary`).
- thin divider `Box` (1px) between the two fields — gated (build-time `_build.array.includes`) on **both** `assignees` and `due_date` being in `show`, so a single-field action (e.g. `universal_fields: [assignees]`) renders no dangling separator.
- **Due**: `Due` label → the due-aware `Tag` when `due_date` is set, else a dashed `No due date` placeholder `Tag`.
- **✎** edit button — unchanged, always last.

Labels use a small uppercase secondary style consistent with the mockup (`designs/workflows-module/parts/67-action-fields-header/mockups/mockup.html`, Option A).

## Files changed

- `modules/workflows/components/universal-fields/universal-fields-chips.yaml` — labels, empty states, the assignees `List` (stock `Avatar` stack + `Tooltip` + `Link` to the contacts `view` via `_module.pageId`), due-aware pill, `overdue` computation. No plugin block; no changes under `plugins/`. **Var-contract change:** the assignees field is now a `List` whose `id` must be the literal state path, so the chips stop taking `assignee_docs` as an operator leaf and instead take the docs **path as a build-time string** (used both as the `List` `id` and, via `_state: {path}`, for the `+N` overflow count). The `action_data` operator map therefore shrinks to `due_date` + the new `stage` leaf. The file's header comment (which documents the old `action_data.assignee_docs` avatar-source contract) is rewritten to match.
- `modules/workflows/components/universal-fields/universal-fields.yaml` — remove the now-dead `mode: display` group (nothing renders it — the edit modal uses `mode: edit`, the check surface composes the chips), collapse the `mode` var to edit-only, and correct the stale header comment that still claims the check surface uses the display group.
- `modules/workflows/module.lowdefy.yaml` — no new var. Update the `contacts` dependency description: it is now also consumed by the chips' assignee-avatar link (cross-module `_module.pageId: view`), so it is no longer "only exercised when a workflow form uses contact fields."
- The six chip consumers (5 templates + `check-action-surface.yaml`) — switch `assignee_docs` from an operator leaf to a build-time path string (`action.assignee_docs` on the four form templates; `current_action.assignee_docs` on `action.yaml.njk` + `check-action-surface.yaml`) and pass the new `stage` leaf. Nothing to thread for the contact link — the `_module.pageId` ref lives in the shared chips file.

## Non-goals

- No change to the edit **modal** (`universal-fields-modal.yaml`) or the underlying update operation — the chips remain display-only.
- Assignees remain user records; linking relies on the unified `user_contacts` model (user `_id` resolves on the contact view), exactly as the events timeline already links event actors.
