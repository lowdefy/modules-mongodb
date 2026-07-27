# Task 4: Add "see also part 25" lines to sibling designs

## Context

Part 25 ships a new shared page (`group-overview`), a new operational Api (`get-action-group-overview`), and a one-line edit in `actions-on-entity`. Three sibling designs maintain surface inventories that should mention the new artifacts so consumers can find them from the right entry point:

- [Part 17 — shared-pages](../../_completed/17-shared-pages/design.md) (shipped): inventory of shared pages. Currently lists `task-edit` / `task-view` / `task-review` / `workflow-overview`.
- [Part 18 — entity-components](../../_completed/18-entity-components/design.md) (shipped): describes `actions-on-entity.yaml`'s `actionGroupConfig` builder. Part 25 extends that builder.
- [Part 19 — operational-apis](../../_completed/19-operational-apis/design.md) (shipped): inventory of operational Apis. Currently lists `start-workflow` / `cancel-workflow` / `close-workflow` / `get-entity-workflows` / `get-workflow-overview`.
- [Part 20 — module-manifest](../../20-module-manifest/design.md): future formal manifest contract. Currently pending. Part 25's manifest edits are progressive; Part 20 will fold them in when it lands.

Per design.md "Cross-references in sibling designs", each gets a one-line "see also part 25" pointer rather than reopening their content.

## Task

### 1. Edit `designs/workflows-module/parts/_completed/17-shared-pages/design.md`

Find the inventory of shared pages. Add `group-overview` alongside `workflow-overview` and the `task-*` pages, with a one-line description and a link to Part 25:

> `group-overview` — shared page focused on a single action group within a workflow. Shipped in [part 25](../25-group-overview-page/design.md).

Don't move ownership of the page into Part 17 — Part 25 owns the file. The line is a pointer.

### 2. Edit `designs/workflows-module/parts/_completed/18-entity-components/design.md`

Under the `actions-on-entity` "Client-side data prep for `ActionSteps`" section (around line 44-53 — the `actionGroupConfig` paragraph), add a "see also" line noting that Part 25 extends the builder to populate `actionGroupConfig[group].link`:

> **Per-group title link (Part 25 extension).** [Part 25](../../25-group-overview-page/design.md) extends this `actionGroupConfig` builder to also write `link: { pageId, urlQuery: { workflow_id, group_id } }` on every group, so each group title becomes a clickable navigation surface into the `group-overview` page. The block-level `actionGroupConfig[group].link` slot is already shipped; Part 25's edit is in the `_js` builder only.

The base description of the builder stays the same — the extension note sits below it.

### 3. Edit `designs/workflows-module/parts/_completed/19-operational-apis/design.md`

Find the Api inventory. Add a row for `get-action-group-overview`:

> `get-action-group-overview` — returns one workflow + one action group's metadata + ordered + filtered actions in that group. Shipped in [part 25](../../25-group-overview-page/design.md). Reuses this part's `access_filter` stage at `api/stages/access_filter.yaml`.

### 4. Edit `designs/workflows-module/parts/20-module-manifest/design.md`

If Part 20 lists out the manifest-shape contract's `exports.pages` and `exports.api` entries, append `group-overview` (under pages) and `get-action-group-overview` (under api) with one-line descriptions and a link to Part 25. If Part 20 is still very high-level and doesn't enumerate exports yet, add a brief note acknowledging Part 25 (and the other progressive manifest editors — parts 4 / 15 / 17 / 18 / 19) and that Part 20 will reconcile.

## Acceptance Criteria

- Parts 17, 18, 19, 20 design.md files each contain a clear pointer to Part 25.
- No design.md elsewhere in `designs/workflows-module/parts/` has been edited.
- No file moves; no other content changes in the sibling designs.
- Markdown links resolve to the right paths.

## Files

- `designs/workflows-module/parts/_completed/17-shared-pages/design.md` — **modify** — append `group-overview` pointer to the shared-pages inventory.
- `designs/workflows-module/parts/_completed/18-entity-components/design.md` — **modify** — append "Per-group title link (Part 25 extension)" note under the `actionGroupConfig` builder section.
- `designs/workflows-module/parts/_completed/19-operational-apis/design.md` — **modify** — append `get-action-group-overview` row to the Api inventory.
- `designs/workflows-module/parts/20-module-manifest/design.md` — **modify** — append page + api entries (or a single acknowledgement, depending on what Part 20 currently spells out).

## Notes

- This is a docs-only task. No code, no manifest, no build verification.
- Don't reopen content owned by the sibling parts. If a sibling design has its own "Implementation tasks" or "Status" section, leave it alone — Part 25 doesn't own that.
- The four edits are independent; if a sibling design has changed shape between when Part 25 was written and when this task is executed, adapt the pointer location to the new shape rather than recreating an outdated structure.
