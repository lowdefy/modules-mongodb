# Task 2: Rebuild the title block — type eyebrow, status pill, loading skeleton

## Context

`modules/shared/layout/title-block.yaml` is the default page title bar, composed by the `page` component (`modules/layout/components/page.yaml`). Today it renders, left to right: an optional back button, an optional status badge (a `Tag` styled as a full-height pill, driven by raw `badge_text` + `badge_color`), then a title `Html` block (`<h2>` + change-stamp subtitle), then a page-actions box.

It receives these `_ref` vars from `page.yaml`: `title`, `doc`, `page_actions`, `show_back_button`, `back_link`, `badge_text`, `badge_color`.

This task replaces the raw badge with a status enum pill, adds an entity-type "eyebrow" above the title, and adds an opt-in loading skeleton — and threads the new vars through `page.yaml`.

### New prop interface

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `type` | string | `null` | Entity-type eyebrow label above the title. Hidden when `null`. Rendered uppercased by the component. |
| `status` | string | `null` | Status slug (runtime), looked up in `status_enum`. Hidden when `null` or unmatched. |
| `status_enum` | object | `null` | Status-enum map (build-time `_ref`) with the standard `{ color, borderColor, titleColor, title }` entry shape. |
| `loading` | boolean | `false` | When truthy, title/subtitle/status render as skeletons. |
| ~~`badge_text`~~ | — | — | **Removed**. |
| ~~`badge_color`~~ | — | — | **Removed**. |

Existing props (`title`, `doc`, `page_actions`, `show_back_button`, `back_link`) are unchanged.

### Status-enum colour contract

The status pill consumes the standard enum entry shape (the same one `action_statuses.yaml` and `workflow_lifecycle_stages.yaml` already use):

```yaml
<slug>:
  color: '#e6f7ff'        # → pill background
  borderColor: '#91d5ff'  # → pill border
  titleColor: '#096dd9'   # → pill text
  title: In Progress      # → pill label
```

### Visual spec (source of truth; `mockups/mockup.html` mirrors it)

- **Type eyebrow** — uppercase, `letter-spacing` ~0.08em, ~11px, secondary text colour, sits directly above the title with a small gap (~2px).
- **Title** — unchanged `<h2>` (24px, 600).
- **Subtitle** — unchanged change-stamp line (secondary, ~13px).
- **Status pill** — chunky, vertically centred (NOT full-height). ~`padding: 15px 14px`, `border-radius: 6px`, `font-size: 15px`, `font-weight: 500`, single-line. Fill = enum `color`, border = enum `borderColor`, text = enum `titleColor`. Sits to the left of the title block; hidden when no status.
- **Loading state** — status pill, title, and subtitle render as shimmer skeletons sized to their real footprint (pill ~96×50, title bar ~26px tall, subtitle bar ~13px tall). The eyebrow renders immediately.

## Task

### A. Rewrite `modules/shared/layout/title-block.yaml`

Keep the outer `Box` with `layout.selfAlign: middle` and the `_build.array.concat` block list. Keep the **back button** block exactly as-is.

**1. Status pill (replaces the `title-badge` `Tag`).**

- Build the pill block only when `status_enum` is wired (`_build.if` on `status_enum != null`), so pages without a status produce no pill block at all.
- The three-colour contract (independent fill / border / text) **cannot** ride antd `Tag`'s single-value `color` prop. Use a `Box` or `Html` with explicit `backgroundColor` / `borderColor` / `color` style bindings instead.
- Resolve the enum entry at runtime via `_get` from the `status_enum` map keyed by the `status` slug. Read `.title` for the label and `.color` / `.borderColor` / `.titleColor` into the pill style. Note `status_enum` is a build-time `_ref` value (already a resolved object), so it can be embedded as the `from:` of a runtime `_get`.
- `visible` gated on **`loading` OR the resolved status entry being non-null**. Lowdefy skips `loading`/`skeleton` when `visible` is `false` (`Block.js:250`), and `status` is null during load — so gating purely on the resolved status would suppress the pill skeleton and make it pop in without one. The `loading` disjunct keeps the pill visible (and skeletoning) during load; once loaded, an unmatched/null `status` hides it (no grey placeholder).
- Layout: `flex: 0 0 auto`, `selfAlign: middle`, sits to the left of the title. The `selfAlign: middle` is required — the outer row's default cross-axis alignment is stretch (the old badge used `selfAlign: stretch` + `height: 100%`), so without it the pill stretches full-height. Style per the visual spec (`padding: 15px 14px`, `borderRadius: 6`, `fontSize: 15`, `fontWeight: 500`, single line, vertically centred — not `height: 100%`).
- **Loading:** the pill carries `loading: { _var: loading }` + a `skeleton:` tree containing a `Skeleton` sized ~96×50. Do **not** use `Tag` inside the `skeleton:` tree. Because the pill block only exists when status is wired, pages without a status never flash a placeholder pill.

**2. Type eyebrow — its OWN sibling block above the title/subtitle block.**

- It MUST be a separate sibling block, not folded into the title block. Lowdefy's loading mechanism swaps the *entire* block to its skeleton tree when `loading` is true (`CategorySwitch.js:34`); an eyebrow nested inside the title block would vanish whenever `loading` is set, breaking the "eyebrow renders immediately, never skeletoned" guarantee. Keep it a sibling with **no** `loading`/`skeleton` of its own.
- Gate it `_build`/runtime on `type != null` (hidden when `null`).
- Render the `type` string uppercased (`text-transform: uppercase` styling — pass `type` in normal case; the component uppercases). Style per spec: ~11px, `letter-spacing` ~0.08em, secondary text colour.
- Structurally the eyebrow sits directly above the title. The outer Box is a horizontal row (no `layout.direction`), so a bare preceding sibling would render *left-of* the title, not above it. Wrap the eyebrow + title/subtitle block in a **column** box (`layout.direction: column`, a small `gap` for the ~2px eyebrow→title spacing) and move the `flex: 1 0 auto` currently on the title `Html` onto that column wrapper. The eyebrow stays a separate block from the title/subtitle block (which carries `loading`), so the "never skeletoned" guarantee holds.

**3. Title + subtitle block (the existing title `Html`).**

- Keep the existing `<h2>` + change-stamp subtitle `Html` template unchanged in content.
- Add `loading: { _var: loading }` + a `skeleton:` tree: a `Skeleton` sized to the title (~26px tall) and a thinner `Skeleton` for the subtitle (~13px tall). Follow the `loading:`/`skeleton:` pattern already used in `modules/shared/layout/card.yaml`.

**4. Page-actions block** — unchanged.

### B. Thread vars through `modules/layout/components/page.yaml`

In the default-title-block `_ref` (currently passing `title`, `doc`, `page_actions`, `badge_text`, `badge_color`, `show_back_button`, `back_link`):

- **Remove** `badge_text` and `badge_color`.
- **Add** `type` (default `null`), `status` (default `null`), `status_enum` (default `null`), `loading` (default `false`), each read from the page-level `_var` of the same name.
- Keep `title`, `doc`, `page_actions`, `show_back_button`, `back_link` as-is.

## Acceptance Criteria

- `title-block.yaml` renders a type eyebrow (uppercased, above the title) when `type` is set, and nothing when `type` is `null`.
- The status pill renders with independent fill/border/text from the enum's `color`/`borderColor`/`titleColor`, is vertically centred (not full-height), and is hidden when `status` is null/unmatched. No `Tag` is used for the pill.
- When `loading` is truthy: the pill (if wired), title, and subtitle show shimmer skeletons; the eyebrow still renders. The eyebrow has no `loading`/`skeleton` of its own and is not nested inside any block that does.
- `badge_text`/`badge_color` no longer appear in `title-block.yaml` or `page.yaml`.
- `page.yaml` passes `type`, `status`, `status_enum`, `loading` through to the title-block `_ref` with the documented defaults.
- `pnpm ldf:b` (from `apps/demo`) builds successfully.

## Files

- `modules/shared/layout/title-block.yaml` — modify — add type eyebrow + status pill (replacing the badge) + loading/skeleton; keep back button, title/subtitle, page-actions.
- `modules/layout/components/page.yaml` — modify — thread `type`/`status`/`status_enum`/`loading` into the title-block `_ref`; remove `badge_text`/`badge_color`.

## Notes

- After this task, callers still passing `badge_text`/`badge_color` (workflow-overview, workflow-group-overview) will compile but lose their badge until migrated in tasks 3–4. That's expected.
- The wholesale `title_block` override path in `page.yaml` is unaffected — it replaces the block entirely and never used these props.
- Reference `modules/shared/layout/card.yaml` for the established `loading:`/`skeleton:` + `Skeleton` block idiom.
