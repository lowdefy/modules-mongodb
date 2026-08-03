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

- The deal detail panel's open-items row now stacks Actions above Tasks at full
  width instead of splitting them across two half-width columns. No container
  chrome was added; the existing section headers remain the only labelling.
- The related-deals strip is bounded to a single non-wrapping row that scrolls
  horizontally. Its cards are a fixed 180px with the deal name ellipsised to one
  line, and the lookup returns 10 rather than 20. Previously up to twenty
  content-width cards wrapped into several ragged rows and pushed the timeline
  tabs below the fold.
- The workspace columns are evened to 12/12; the pipeline column was previously
  narrower than the detail column beside it.
- The deals list panel gains a "New deal" button in its header and a chevron
  that collapses the panel to a narrow rail, widening the workspace. Below
  768px, where the panel is full width and stacks above the workspace,
  collapsing leaves a header-only strip.
- Card numbers flagged `round: true` in `card_fields` render at two decimal
  places on both the list-page card and the workspace panel card, which
  previously disagreed — the workspace card truncated to whole numbers.

`button_new_deal` gained `size` and `visible` vars, both defaulted to preserve
its current rendering on the deals list page.

activities: `capture_activity`'s docblock corrected — it documented five
`prefill` keys where the component has always supported seven, omitting
`attributes` and `references`, and did not record that those two apply in
`mode: modal` only. Comment-only; no behaviour change.
