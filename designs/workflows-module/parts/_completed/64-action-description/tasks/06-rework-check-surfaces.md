# Task 6: Module — rework the check page (authored `description` + content-card layout) + in-context surface cleanup

## Context

After Task 4, `components/action-description.yaml` exists (a plain `Markdown` leaf taking a `content` var). After Task 2, the `get_workflow_action` envelope's `description` key holds the **rendered authored** description string. This task swaps the tinted callout for the plain `action-description.yaml` render on the **check page**, lands the design's "Middle-column layout model" there (one content card + a bare-alerts slot), and removes the now-dead `fields.description` seeds (which fed the deleted editable TiptapInput).

**The in-context modal (`check-action-surface.yaml`) does cleanup only.** Per the design (point 6, "Rendering the description", Non-goals), the modal's authored-`description` render and any layout reconciliation are **deferred to a separate design**. This task does **not** add the authored render there — it only removes the dead editable-`description` mapping the field deletion forces. The modal is already a single `Card`, so no layout change is needed here; after this part it simply shows no description until the follow-on design lands.

Surfaces:

- **`templates/action.yaml.njk`** — the per-workflow `{workflow_type}-action` check page. The middle column is today a bare block list (no content card): slot 0 is a `_ref` to `universal-fields-callout.yaml` sourced from `_state: current_action.description` (lines ~215–222), **followed by** the `workflow_closed_banner` Alert (~225), the entity-view slot, and the comment. The design's layout model reorders this: bare alerts (closed banner) on top, then **one content card** wrapping the working content (description lead-in → entity slot → comment). The page also seeds `current_action.fields.description` from `_request: get_workflow_action.description` in **8** `set_current_action`-style SetState blocks (the seed lines at ~157, 325, 479, 570, 667, 788, 879, 947 — each is the `description:` entry under a `current_action.fields:` map).
- **`components/check-action-surface.yaml`** — the in-context modal/surface body. It composes `universal-fields.yaml` and passes `action_data.description: { _state: current_action.fields.description }` (lines ~169–170). **Cleanup only** (remove that mapping); no render added.
- **`components/check-action-modal.yaml`** — seeds `current_action.fields.description` from `_request: get_workflow_action.description` (lines ~108–110).

The envelope key stays `description`; `current_action.description` (the spread of the whole envelope into `current_action`) already holds the rendered authored string, so `action-description.yaml` can bind `_state: current_action.description` directly.

## Task

**`templates/action.yaml.njk`** — the layout-model rework (design "Middle-column layout model" + Files-changed note):

1. **Bare-alerts slot (top, uncarded).** Keep `workflow_closed_banner` (the `Alert` at ~225) as a full-width block at the **top** of the middle column, ahead of the content card — it is a hard-stop notice and must sit first, above the description. (It already sits in the middle column; the change is that it now precedes the card rather than following the description callout. This is also where Part 62's changes-requested callout will later slot, below the banner.)
2. **One content card.** Wrap the working content — description lead-in, entity-view slot, comment, and the request-changes modal — in a **single** content `Card` (the middle column is a bare block list today; the design makes it match the in-context modal, which is already one card).
3. **Description as the card's first child.** Inside that card, the **first** block is a `_ref` to `components/action-description.yaml`, passing `vars.content: { _state: current_action.description }` — replacing the old slot-0 `_ref` to `components/universal-fields/universal-fields-callout.yaml`. No tint, no eyebrow, no box of its own. Update the comment ("Description callout … self-hides" → "Authored description — plain Markdown lead-in inside the content card; self-hides when unset"). The entity-view slot and comment follow it inside the same card.
4. Remove the `description:` entry under every `current_action.fields:` SetState map (the 8 occurrences feeding `fields.description` from `get_workflow_action.description`). Leave the sibling `assignees` / `due_date` entries intact. The ✎ edit modal's `show` already defaults to `[assignees, due_date]` after Task 5 — no further change needed here for that.

**`components/check-action-surface.yaml`** — **cleanup only** (no render added; the modal's authored-description render is deferred to a separate design — design Non-goals):

5. Remove the `description: { _state: current_action.fields.description }` mapping (lines ~169–170) from the `action_data` block passed into the `universal-fields.yaml` composition. **Do not** add an `action-description.yaml` render here. The modal is already a single `Card`, so no layout change is needed — after this part it shows no description until the follow-on design adds the authored render (the shared `action-description.yaml` leaf is built so that design can drop it straight in).

**`components/check-action-modal.yaml`:**

6. Remove the `description:` entry (lines ~108–110) under the `current_action.fields:` SetState map. Leave `assignees` / `due_date`.

## Acceptance Criteria

- `action.yaml.njk`'s middle column follows the layout model: `workflow_closed_banner` is a bare full-width alert at the **top** (above the card), and a **single** content `Card` wraps the working content whose **first child** is `components/action-description.yaml` sourced from `current_action.description`, followed by the entity-view slot and comment. No `universal-fields-callout.yaml` ref remains in this file.
- No `current_action.fields.description` (or `get_workflow_action.description → fields.description`) seeds remain in `action.yaml.njk`, `check-action-surface.yaml`, or `check-action-modal.yaml`.
- `check-action-surface.yaml` no longer passes `description` into `universal-fields.yaml` and does **not** add an `action-description.yaml` render (deferred — Non-goals).
- `grep -rn "fields.description" modules/workflows/templates/action.yaml.njk modules/workflows/components/check-action-surface.yaml modules/workflows/components/check-action-modal.yaml` returns nothing.
- `cd apps/demo && pnpm ldf:b` compiles.

## Files

- `modules/workflows/templates/action.yaml.njk` — modify — bare-alerts slot (closed banner on top) + one content card wrapping description (first child) → entity slot → comment; swap slot-0 callout `_ref` → `action-description.yaml`; remove 8 `fields.description` seeds.
- `modules/workflows/components/check-action-surface.yaml` — modify — **cleanup only**: drop `description` from the universal-fields `action_data`; no render added (modal render deferred).
- `modules/workflows/components/check-action-modal.yaml` — modify — remove the `fields.description` seed.

## Notes

- Depends on Task 4 (the `action-description.yaml` component must exist before it is referenced).
- The `universal-fields-callout.yaml` file is **not** deleted here — `action.yaml.njk` is only one of its consumers; the four form templates still reference it. Its deletion happens in Task 7 once the last consumer is swapped.
- The exact seed line numbers will drift as edits are applied; locate each by the `description:` key under a `current_action.fields:` map, not by line number.
- The in-context modal's authored-`description` render is **out of scope** (deferred to a separate design). This task touches `check-action-surface.yaml` for mandatory field-deletion cleanup only.
