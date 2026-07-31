# Task 2: Bound the related-deals strip to one non-wrapping row

## Context

The deal workspace's detail panel shows a "Related Deals" strip — other deals belonging to the same
company. It is rendered by `modules/deals/components/detail/section_related_deals.yaml` as a `List`
with `direction: row`, whose items are `modules/deals/components/deal_list_item_compact.yaml` cards
at `layout: { flex: 0 1 auto }`. The rows come from a `$lookup` inside
`modules/deals/requests/get_selected_deal.yaml` with `$limit: 20`.

Two things make the strip grow without bound: the cards are **content-width**, and their deal name
clamps to **two lines** (`-webkit-line-clamp: 2`), so a card is one or two lines tall depending on
the name. Up to twenty such cards wrap into five or more ragged rows, pushing the activities/events
timeline tabs below the fold.

Capping by pixel height would clip a row mid-card, and capping by count alone bounds nothing while
widths vary. Making the cards uniform removes both problems: fixed width and a single-line name make
height and width constant, at which point a count limit genuinely bounds the strip.

Task 1 has already restructured this request's workflow `$lookup`; this task edits a different stage
in the same file.

## Task

**1. Fix the card geometry in `modules/deals/components/deal_list_item_compact.yaml`.**

- Change the card's `layout` from `flex: 0 1 auto` to a fixed 180px width — the card must not grow or
  shrink. Use `flex: 0 0 180px`.
- In the card's Nunjucks template, change the deal-name `div` from the two-line clamp to a
  single-line ellipsis: drop `display: -webkit-box`, `-webkit-line-clamp: 2` and
  `-webkit-box-orient: vertical`, and use `white-space: nowrap` with the existing
  `overflow: hidden; text-overflow: ellipsis`. The row above it (deal id plus stage/outcome chips)
  already uses `flex-shrink: 0` on the chip group and needs no change.

180px is chosen so roughly four cards are visible before scrolling in the detail column at its new
width (see task 5), with the ~150px floor set by the top row's deal code beside the longest stage
title. It is a **module constant, not a var** — no host needs it configurable.

**2. Make the strip a single non-wrapping row in `section_related_deals.yaml`.**

The `related_deals` `List` must lay its items out in one row that scrolls horizontally when it
overflows: no wrapping, `overflow-x: auto`, and vertical overflow hidden so a stray scrollbar
doesn't appear. Apply this to the List's own container styling.

**3. Reduce the lookup limit in `modules/deals/requests/get_selected_deal.yaml`.**

Change the related-deals `$lookup` sub-pipeline's `$limit: 20` to `$limit: 10`. It is the `$lookup`
whose `as: related_deals` and which sorts by `updated.timestamp: -1`. Do not touch the workflows
`$lookup` that task 1 restructured.

## Acceptance Criteria

- `deal_list_item_compact.yaml` sets a fixed 180px card width and a single-line ellipsised name; no
  `-webkit-line-clamp` remains in that file.
- `section_related_deals.yaml` produces one row that scrolls horizontally and never wraps.
- `get_selected_deal.yaml`'s `related_deals` lookup limits to 10; the `$sort` on
  `updated.timestamp: -1` is unchanged, so the ten most recently updated are the ones kept.
- `pnpm ldf:b` from `apps/demo` compiles cleanly.
- The empty state (`detail_related_empty`, shown when `related_deals` is empty) and the header are
  untouched and still render.

## Files

- `modules/deals/components/deal_list_item_compact.yaml` — modify — fixed 180px width; name to single-line ellipsis.
- `modules/deals/components/detail/section_related_deals.yaml` — modify — single non-wrapping row with horizontal overflow.
- `modules/deals/requests/get_selected_deal.yaml` — modify — related-deals `$limit` 20 → 10.

## Notes

- **Horizontal, not vertical, and deliberately so.** The detail card containing this strip is itself a
  vertical scroll region (`.body` has `overflow-y: auto` in `pages/view.yaml`). A vertically
  scrolling strip inside it would nest two vertical scrollers and capture wheel gestures from the
  wrong element. A horizontal scroller cannot conflict with its parent.
- **`nowrap` is needed on top of the count limit**, not instead of it: the detail column is a share of
  the workspace, so a count that fits one row on a wide screen would wrap to two on a narrow one.
- Accepted trade-off: a single-line name shows less than today's two-line clamp.
  `deal_list_item_compact.yaml` has no other consumer, so nothing else changes shape.
- `deal_list_item_compact.yaml` also carries the card's `onClick` handler chain (deal selection,
  request refetches, workflow refetch). Leave all of it alone — this task is presentation only.
