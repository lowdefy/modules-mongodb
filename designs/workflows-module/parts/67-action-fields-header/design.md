# Action fields header

The workflow action pages render an action's universal fields (`assignees`, `due_date`) as a chip strip in the page title bar (`components/universal-fields/universal-fields-chips.yaml`, composed by every action template into the layout `page_actions` slot). Today the strip is unlabelled, its avatars are a flat non-interactive group, its due-date pill has no colour (so it blends into the header background), and when nothing is set the whole strip collapses to a lone pencil — which reads as lost. This part relabels and restructures the strip into two labelled fields with real empty states, gives the due pill a due-aware colour, and makes each assignee avatar a hover-named link to the contact page (matching the events timeline).

## Proposed change

1. **Inline labels, one row (Option A).** The strip becomes `Assignees {avatars} │ Due {pill} ✎` — each field carries a small uppercase label, separated by a thin divider, with the ✎ edit button anchored at the end. Layout unchanged: still the title-bar `page_actions` slot, still gated on the action declaring universal fields.
2. **Real empty states (Option X).** When there are no assignees, the field shows muted italic `Unassigned` text instead of hiding the avatars; when `due_date` is null it shows a dashed `No due date` placeholder pill. The label and the ✎ are always present, so the strip never collapses to a bare icon.
3. **Due-aware pill colour (Option C), fixing the blend bug.** The due pill's colours are set **explicitly** (no reliance on the antd default that currently makes it invisible): a neutral grey pill normally, switching to the shared `action_statuses` **`error`** palette (red) when the action is **overdue** — `due_date` is before today _and_ the action is not in a terminal stage (`done` / `not-required`). Completed actions never show red.
4. **New `ContactAvatars` plugin block.** Assignee avatars move from the core `Avatar` group block (which supports no per-avatar tooltip or link) to a new display-only block in `@lowdefy/modules-mongodb-plugins`. It renders an overlapping avatar stack with per-avatar hover-name tooltips and an optional click-through to the contact page, with `+N` overflow. It reuses the exact avatar renderer already in `EventsTimeline` (extracted to a shared internal module), so the two surfaces stay visually identical.
5. **Optional contact-link wiring.** A new `contact_page_url` workflows var (mirroring the events module's var, `{id}` placeholder) is threaded to the chips; when set, avatars link to the contact view, when unset the link is disabled. Off by default — no behaviour change for apps that don't configure it.

## Why a plugin block, not a List-in-state

The obvious pure-config route is to seed `assignee_docs` into a state array and iterate it with a Lowdefy `List`, wrapping each item in a `Tooltip` + link. We rejected it:

- The chips are **display-only and refetched** after every field edit (the universal-fields modal's `on_complete` re-runs `get_workflow_action`). A `List` binds to a _state_ array, so the docs would have to be `SetState`-seeded on mount **and** re-seeded after every refetch, across all six consumers (five templates + `check-action-surface.yaml`) — and would still risk going stale.
- The core `Avatar` group block already can't do per-avatar tooltips or links (only one `onClick` on the whole group), so the group visual would have to be rebuilt in YAML anyway.

A display-only plugin block reads `properties.data` straight off the `action.assignee_docs` operator, so it stays reactive for free, needs no state plumbing, and gives us the timeline's proven tooltip + link + initials/gradient-fallback + overflow rendering. One renderer, two consumers — the "one correct way" over reconstructing it per-page.

## Current state

`universal-fields-chips.yaml` is a `Box` (row) composed into `page_actions` by `edit`, `view`, `review`, `action`, and `error` templates plus `check-action-surface.yaml`. It renders, left→right:

- **Assignees** — a single `Avatar` block in _group_ mode; the `avatars` array is computed by `_js` from `action_data.assignee_docs` (entries `{ _id, profile: { name, picture } }`, where `picture` is a pre-generated gradient SVG). Hidden entirely when there are no docs.
- **Due date** — a `Tag` with `icon: AiOutlineCalendar` and the formatted date. **No `color` set** → antd v6 renders its faint default, which blends into the header (the reported "not showing" bug). Hidden when null.
- **Edit ✎** — a text `Button`, always present, opens `universal_fields_edit_modal`.

There are no labels, so with both fields empty only the ✎ survives.

The events timeline (`plugins/.../EventsTimeline.js`) already solves the avatar-link problem: its internal `Avatar` component wraps an image/initials in a `Tooltip` and, unless `disableContactLink`, an `<a href>` built by `buildContactHref(contactPageUrl, userId)` (`{id}` substitution or `?_id=` append). `AvatarStack` handles overlap + `+N` overflow. This is the renderer we extract and share.

## The `ContactAvatars` block

New block under `plugins/modules-mongodb-plugins/src/blocks/ContactAvatars/` (`ContactAvatars.js`, `meta.js` — `category: display` —, `schema.json`, `README.md` stub), exported from `blocks.js` and `metas.js` (the build's `extractBlockTypes` picks it up via `types.js`). The workflows module already declares `@lowdefy/modules-mongodb-plugins` in its `plugins:`, so no manifest change is needed for availability.

**Shared renderer.** Factor the `Avatar` + `AvatarStack` functions out of `EventsTimeline.js` into a shared internal module (e.g. `src/blocks/_shared/contactAvatars.jsx`) and have both `EventsTimeline` and `ContactAvatars` import it. No visual change to the timeline; it's a pure refactor to avoid a second copy.

**Props:**

| Prop                 | Type    | Notes                                                                                                                                            |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data`               | array   | `[{ id, name, picture }]` — the chips map `assignee_docs` (`{ _id, profile:{name,picture} }`) into this shape via the `_js` that already exists. |
| `contactPageUrl`     | string  | Optional. `{id}` placeholder or `?_id=` append (same `buildContactHref` as the timeline).                                                        |
| `disableContactLink` | boolean | Default `false`. No link when true or when `contactPageUrl` is unset.                                                                            |
| `maxCount`           | number  | Default 5; overflow collapses to `+N`.                                                                                                           |
| `size`               | number  | Default small (matches the current chip avatars).                                                                                                |

Display-only: no state binding, no events required.

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

Because a stored date vs. "today at day granularity" comparison is awkward with comparison operators, this is a small `_js` leaf (per the js-operator guide — operators would nest badly here). It reads `action_data.due_date` + a new `action_data.stage` leaf, so it recomputes automatically on refetch. Each consumer passes `stage: _state: action.status.0.stage` (check surface: `current_action.status.0.stage`) alongside the existing `assignee_docs` / `due_date`.

## Labels & empty states

The chips `Box` becomes a labelled two-field row (`layout.direction: row`, `contentAlign: center`, `gap`), per field gated by the existing `show` array:

- **Assignees**: `Assignees` label → `ContactAvatars` when `assignee_docs` is non-empty, else muted italic `Unassigned` (`Paragraph`, `type: secondary`).
- thin divider `Box` (1px) between the two fields.
- **Due**: `Due` label → the due-aware `Tag` when `due_date` is set, else a dashed `No due date` placeholder `Tag`.
- **✎** edit button — unchanged, always last.

Labels use a small uppercase secondary style consistent with the mockup (`designs/workflows-module/parts/67-action-fields-header/mockups/mockup.html`, Option A).

## Files changed

- `plugins/modules-mongodb-plugins/src/blocks/ContactAvatars/` — new block (+ `blocks.js`, `metas.js` exports).
- `plugins/modules-mongodb-plugins/src/blocks/_shared/contactAvatars.jsx` — extracted shared renderer.
- `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js` — import the shared renderer (no behaviour change).
- `modules/workflows/components/universal-fields/universal-fields-chips.yaml` — labels, empty states, `ContactAvatars`, due-aware pill, `overdue` computation.
- `modules/workflows/module.lowdefy.yaml` — new `contact_page_url` var (+ generated `docs/workflows/reference/vars.md` via `pnpm docs:gen`).
- The six chip consumers (5 templates + `check-action-surface.yaml`) — pass the new `stage` leaf and thread `contact_page_url` into the chips `_ref` vars.
- `apps/demo/modules/workflows/vars.yaml` — set `contact_page_url` to the contacts view (demo wiring, matching the events module).

## Non-goals

- No change to the edit **modal** (`universal-fields-modal.yaml`) or the underlying update operation — this is display-only.
- No change to the `mode: display` group in `universal-fields.yaml` (still used by the in-context check surface).
- Assignees remain user records; linking relies on the unified `user_contacts` model (user `_id` resolves on the contact view), exactly as the events timeline already links event actors.
