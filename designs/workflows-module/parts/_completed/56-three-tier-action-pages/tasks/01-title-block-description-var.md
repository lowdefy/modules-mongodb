# Task 1: Add an optional `description` subtitle var to the shared title-block

## Context

The Part 56 action pages render their header from the layout module's **native
chrome**, not from new components. The header (breadcrumb + eyebrow + title +
status pill) is already produced by:

- `modules/layout/components/page.yaml` — the `page` component every module page
  `_ref`s. It renders the page breadcrumb (from the `breadcrumbs` var) and
  `_ref`s `modules/shared/layout/title-block.yaml`, forwarding a fixed set of
  vars (`title`, `doc`, `page_actions`, `type`, `status`, `status_enum`,
  `loading`, `show_back_button`, `back_link`).
- `modules/shared/layout/title-block.yaml` — renders the optional back button,
  the status pill, the `type` eyebrow, the title, and a **subtitle line**. Today
  the subtitle is hard-wired to a change-stamp string built from the `doc` var
  (`Last modified by … / Created by …`).

Part 56's action pages need the subtitle to show the action's **`message`**
instead of a change-stamp. The design (D8) specifies this as a single additive
change: `title-block` gains an optional `description` var rendered in the
subtitle slot, shown **in place of** the change-stamp line when set. Pages that
pass no `description` keep the existing change-stamp subtitle — fully
backward-compatible.

## Task

1. In `modules/shared/layout/title-block.yaml`, add an optional `description`
   var. In the `title` Html block's `_nunjucks` template (currently lines
   ~177–193), render the subtitle as: **if `description` is set, show it;
   otherwise** fall back to the existing change-stamp block (the
   `doc.updated`/`doc.created` lines). Wire `description` into the template's
   `on:` map alongside `title` and `doc`. Keep the existing
   `text-text-secondary text-sm` subtitle styling.

2. In `modules/layout/components/page.yaml`, forward a new `description` var into
   the `_ref` of `title-block.yaml` (in the default-title-block branch, alongside
   the `title` / `doc` / `type` / `status` forwards, ~lines 209–245), defaulting
   to `null`. **This forwarding is required for the page var to reach
   title-block** — see Notes.

## Acceptance Criteria

- `title-block.yaml` renders the `description` text in the subtitle slot when a
  non-null `description` is passed.
- When `description` is null/omitted, the existing change-stamp subtitle (built
  from `doc`) renders exactly as before — no visual or behavioural change for
  existing pages.
- `page.yaml` forwards `description` to `title-block` (default `null`).
- `pnpm ldf:b` (from `apps/demo`) compiles cleanly.

## Files

- `modules/shared/layout/title-block.yaml` — modify — add `description` var; the
  subtitle Nunjucks template shows `description` when set, else the change-stamp.
- `modules/layout/components/page.yaml` — modify — forward `description` (default
  `null`) into the `title-block` `_ref`.

## Notes

- The design's "Files changed" list names only `title-block.yaml`. The
  `page.yaml` forward is a mechanically-required omission in that list: the
  `page` component `_ref`s `title-block` with an **explicit** var map, so a page
  var not listed there never reaches the component. Forwarding `description` is
  the mechanism, not added scope — flag it in the PR description.
- The breadcrumb itself needs **no** `page.yaml` change: `breadcrumbs` is already
  a page var rendered as `breadcrumb.list` (page.yaml ~lines 27–31).
