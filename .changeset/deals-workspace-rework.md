---
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-activities": minor
---

deals: rework the workspace layout, and key workflow form data by workflow type

**Breaking (config):** `get_selected_deal` now exposes workflow form data as
`workflows.{workflow_type}.{action_type}.{field}`. It was
`workflows.{action_type}.{field}`.

The request no longer joins one workflow — it joins **all** of the deal's
workflows and keys their form data by workflow type, so a deal carrying a
chained lifecycle exposes every workflow's form data rather than only the one
matching the `workflow_type` var.

A stale read **fails silently**: `workflows.volumes.annual_volume` simply
resolves to null, so any `$ifNull` or `_if_none` fallback behind it takes over
and the wrong value renders with no error anywhere. There is no build failure to
catch this. Grep your config for `workflows.` reads — the likely sites are
`request_stages.get_selected_deal` stages and any tile injected through
`components.info_grid_slots` — and insert the workflow-type key. A host stage
that builds its own `workflows` field from its own `$lookup` is unaffected.

Two notes on the keying. Action types are namespaced per workflow by the engine,
which enforces uniqueness only *within* a workflow, so a flat merge keyed by
action type would silently truncate a legal config — hence the workflow-type
key. And the key is the workflow *type*, not the instance: a deal carrying two
workflows of the same type exposes only one of them.

**Info-grid tile order changed.** Blocks injected through
`components.info_grid_slots` now render **before** the built-in People and Files
tiles, where they previously appended after them. No var was renamed and no host
config needs changing, but the rendered order shifts. Tiles are span-12, so the
row pairing depends on how many are injected: with two, the injected pair takes
the first row and People/Files the second.

Layout and presentation:

- The deal detail panel's open actions and open tasks are now **one merged
  list**, ordered overdue tasks → open actions → upcoming tasks, under a single
  "Actions" heading, two per row and paginated at four per page. They were two
  half-width columns with a heading and an empty state each. Tasks and workflow
  actions are both docs in the same `actions` collection, so one heading covers
  both, and there is now one empty state judged on the whole list. Ownership is
  unchanged — `workflows` still resolves actions and `activities` still owns the
  task query; only the rendering moved to the consumer, because a merged row
  needs per-row events (an action navigates, a task opens a modal).
- `activities/open-tasks` gains two vars, both defaulted so existing consumers
  are unaffected. `render: false` fetches and seeds `open_tasks` without drawing
  any cards, for a host that renders the rows itself; `on_loaded` runs an action
  list once that seeding completes. `render` is applied at build time, because
  the card list *is* `open_tasks` — hiding it would delete the state it seeds.
- The related-deals strip is bounded by pagination: two per row, four per page,
  with the deal name ellipsised to one line and the lookup returning 10 rather
  than 20. Previously up to twenty content-width cards wrapped into several
  ragged rows and pushed the timeline tabs below the fold.
- The workspace columns are evened to 12/12; the pipeline column was previously
  narrower than the detail column beside it.
- The deals list panel gains a "New deal" button in its header and a chevron
  that collapses the panel to a fixed 36px rail, widening the workspace. The rail
  is a fixed width rather than a grid share, so it stays sized to its chevron
  instead of tracking the viewport — which also means it applies at every width,
  including below 768px where the expanded panel is full width.
- The deal topbar's action bar now shrinks, so its buttons wrap to a second line
  on a narrow screen instead of spilling the topbar and giving the page a
  horizontal scrollbar. The bar could not shrink before; collapsing the panel on
  a ~375px phone is what made it overflow.
- The workflow card's header keeps its natural height when the workflows are
  expanded. It was a flex item being squeezed by the growing body, losing ~11px —
  enough to clip a two-line title.
- Card numbers flagged `round: true` in `card_fields` render at two decimal
  places on both the list-page card and the workspace panel card. Both
  previously rendered through Nunjucks `round`, which rounds to whole numbers
  (12.6 → 13) and cannot pad trailing zeros.

`button_new_deal` gained `size` and `visible` vars, both defaulted to preserve
its current rendering on the deals list page.

activities: comment-only corrections, no behaviour change. `capture_activity`'s
docblock documented five `prefill` keys where the component has always supported
seven, omitting `attributes` and `references`, and did not record that those two
apply in `mode: modal` only. `open-tasks` described itself as composing with
`open-actions` into one row, which stopped being true once the deals panel
stacked them.
