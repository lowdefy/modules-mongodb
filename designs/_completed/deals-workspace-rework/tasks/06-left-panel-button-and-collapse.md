# Task 6: Add a new-deal button to the left panel and make the panel collapsible

> **As built — the rail mechanism changed.** The `span: 5 → 1` / `19 → 23` approach
> specified below does not work: the row's 16px gap comes off whatever share is
> taken, so a span-1 rail is ~13px at 768px and the chevron overhangs the card.
> Shipped as a fixed `layout.flex: 0 0 36px` with `workspace_col` at `flex: 1 1 0`,
> which also means the collapse is no longer inert below 768px. The card keeps a
> full-height rail (`100vh - 98px`, corrected from 110 to include the topbar
> gutter), and the pipeline card gained `flex-shrink: 0` on its header.
>
> Two further fixes followed from eyeballing it: `workspace_col` needs `min-width: 0`
> as well as the `0` basis, because flex line-breaking measures against the
> `min-width: auto` min-content floor rather than the basis, so a wide descendant
> pushed the entire workspace onto its own line below the rail; and
> `components/detail/action_bar.yaml` went `flex: 0 0 auto` → `0 1 auto` so the topbar
> buttons wrap instead of spilling once the rail takes its 52px. See the collapse
> decision and the layout-shift section in `design.md`.

## Context

`modules/deals/pages/view.yaml` lays out the deals workspace as two columns inside `deals_layout`:
`deal_list_col` (the "Active Deals" panel, `span: 5`) and `workspace_col` (`span: 19`). The left panel
is a `Card` (`deal_list_card`) whose body holds a debounced search box, a `ListSelector` of deals, and
a `Pagination` block. Its `.element` style fixes its height to `calc(100vh - 110px)` and its `.body`
scrolls.

Two additions:

**A new-deal button.** `modules/deals/components/button_new_deal.yaml` already exists — a primary
button titled "New {label}" that links to the module's `new` page — but it is only used on
`pages/all.yaml`. The workspace has no way to create a deal.

**Collapsing the panel.** The panel is always 5/24 wide. On a wide screen that is fine; when working
in the deal itself it is wasted room.

Task 5 has already adjusted this file's column spans and card number formatting.

## Task

**1. Put a compact new-deal button in the list card's header.** `deal_list_card` is a `Card` with a
`properties.title` (the "Active Deals" label). Add the existing `button_new_deal.yaml` via the Card's
`extra` slot, so it sits top-right of the header rather than consuming list height. Render it compact
— `size: small` — to match the card's `size: small` and the small search input beneath it.

Reuse `components/button_new_deal.yaml`; do not write a second button. If its current properties
(`type: primary`, `icon: AiOutlinePlusCircle`) don't suit the compact header, pass overrides at the
call site via `_ref` vars rather than editing the shared component, since `pages/all.yaml` also
consumes it.

**2. Add a collapse toggle and a collapsed state.** Introduce page state (e.g.
`deals_list_collapsed`, default falsey) and a small chevron button that toggles it. Collapsing does
**two** things:

- **Hides the card body** — the search box, the `ListSelector` and the `Pagination` block.
- **Narrows the column** — `deal_list_col`'s top-level `span` drops from `5` to a rail (`1`), and
  `workspace_col`'s rises from `19` to `23` so the workspace takes the reclaimed width.

The chevron must remain visible and clickable in the collapsed state — it is the only way back — so
place it where it survives the body being hidden (the card header/`extra` area, alongside the
new-deal button), not inside the body.

`layout` is operator-evaluated on every render, alongside `properties` and `visible`, so driving
`span` from state is a supported pattern and needs no workaround.

**3. Do not add breakpoint-aware visibility.** It isn't needed, and Lowdefy's `visible` evaluates from
state rather than media queries, so it would mean either a media-query style override or tracking
viewport width in state. The single collapsed state already reads correctly at both widths — see the
table in Notes.

## Acceptance Criteria

- `deal_list_card`'s header renders the new-deal button from `components/button_new_deal.yaml` at
  `size: small`, and `pages/all.yaml`'s use of that component is unaffected.
- Clicking the button navigates to the module's `new` page.
- A chevron toggle collapses and expands the panel, and remains visible and clickable while collapsed.
- Collapsed: the search box, `ListSelector` and `Pagination` are hidden; `deal_list_col` is a rail and
  `workspace_col` is `span: 23`.
- Expanded: the panel returns to `span: 5` with `workspace_col` at `span: 19`, and the deal list still
  works — search, selection, pagination.
- Collapsing does not clear `selected_deal_id` or refetch anything; the workspace keeps showing the
  selected deal.
- `pnpm ldf:b` from `apps/demo` compiles cleanly.

## Files

- `modules/deals/pages/view.yaml` — modify — new-deal button in `deal_list_card`'s `extra` slot; collapse state, chevron toggle, and state-driven spans on `deal_list_col`/`workspace_col`.

## Notes

- **The same collapsed state renders sensibly at both widths, by construction:**

  | Width   | Collapsed renders as                                                          |
  | ------- | ----------------------------------------------------------------------------- |
  | ≥768px  | The narrow rail — span drops, body hidden, chevron remains                      |
  | <768px  | A full-width header-only strip — the span change is inert, the hidden body acts |

  Lowdefy's top-level `span` applies from **768px upward**, while `sm: { span: 24 }` sets the base
  below it. So below 768px the column stays full width no matter what the collapse state says, and
  hiding the body is what takes effect. That sub-768px behaviour is a genuine improvement, not a
  degenerate case: the list card is `calc(100vh - 110px)` tall and stacks *above* the workspace there,
  so today you scroll a full screen past it to reach the deal.

- Whether the collapsed state should persist across page loads is an open question in the design.
  Plain page state (resetting each visit) is the default here — don't reach for `localStorage`.
- The panel's fixed `calc(100vh - 110px)` height and the `ListSelector`'s own
  `height: calc(100vh - 232px)` are tuned to each other. If hiding the body leaves an oddly tall empty
  card when collapsed, adjust the collapsed card's height rather than changing the expanded values.
- This is the first state-driven `layout` in `modules-mongodb` — every other `span:` is a literal.
  Worth a reviewer's eye, but the engine supports it.
