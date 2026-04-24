# Page Layouts

How to structure pages using the layout system — shell, cards, action bars, and content areas.

## Design Philosophy

Read `.impeccable.md` before any UI work. Key principles that shape every layout decision:

- **Show only what matters now.** Every screen answers: "What do I need to do next?" Progressive disclosure over information overload.
- **Clarity is kindness.** Strong hierarchy, unambiguous labels, decisive use of space. If the user thinks about the UI, the UI failed.
- **Every pixel earns its place.** No decorative elements. Whitespace is functional, not waste. Typography does the heavy lifting.
- **Status at a glance, detail on demand.** Color + shape + label for instant recognition. Drill-down for context.
- **Built for the site, not just the screen.** High contrast, 44px minimum touch targets, readable in sunlight.

These aren't aspirational — they're constraints. A page that shows everything at once, uses filler text, or buries status behind clicks violates the design contract.

## Pattern

Every page wraps in `_ref: module: layout, component: page` — the `PageSiderMenu` shell providing header, breadcrumbs, menu, notifications, profile, dark mode toggle, and a content area.

**Page layout vars** — the shell accepts:

- `id`, `title` — page ID and display title
- `breadcrumbs` — array of `{ label, pageId?, icon?, home? }` crumbs
- `page_actions` — button blocks for the title bar (Edit, New, Export)
- `doc` — record object for "Last modified by X on DATE" in title-block
- `events` — `{ onInit, onInitAsync, onMount, onMountAsync }`
- `requests`, `blocks` — page data and content
- `hide_title` — suppress title-block (edit pages use card title instead)
- `hide_notifications`, `hide_profile` — suppress header features
- `content_width` — max-width of content area (default `100%`)
- `title_block` — override the default title-block entirely

**Content components** — shared layout pieces used inside pages:

**`card`** (`_ref: module: layout, component: card`) — the workhorse content container. Vars:

- `title`, `doc` — card header + change stamp metadata
- `width` — max-width with auto margin (use `700` for centered forms)
- `blocks` — card content
- `header_buttons` — buttons in the card's `extra` slot (Edit, Download)
- `footer_buttons` — buttons below the card (inline, not sticky)
- `loading` + `skeleton_height` — skeleton placeholder while data loads
- `hide_title` — hide the card title (default `false`, matches the `hide_title` convention on `layout/page`)
- `show_back_button` — back arrow above the card

**`floating-actions`** (`_ref: module: layout, component: floating-actions`) — sticky bottom bar (Affix) for Save/Cancel on edit pages. Vars: `width`, `actions`.

**`auth-page`** (`_ref: module: layout, component: auth-page`) — centered card layout for login/signup. Full-height, logo cover, branded background. Vars: `id`, `title`, `blocks`, `actions`, `events`, `requests`.

**`title-block`** — auto-included by the page layout (unless `hide_title: true`). Shows title + page actions + "Last modified" from `doc`.

## Data Flow

```
Page YAML → _ref: module: layout, component: page
  → PageSiderMenu renders: header (logo, menu, profile, notifications)
  → title-block renders: title + page_actions + doc metadata
  → blocks render: content area (cards, tables, sidebars)
  → Breadcrumbs show navigation path
```

## Variations

**List page** — flat siblings: filter, table, pagination. AgGrid tables do not need a Card wrapper.

```yaml
blocks:
  - _ref: components/filter_{entities}.yaml
  - _ref: components/table_{entities}.yaml
  - _ref: components/pagination.yaml
```

**Detail page** — two-column with info card + sidebar tiles:

```yaml
blocks:
  - id: layout
    type: Box
    layout: { gap: 16 }
    blocks:
      - id: main
        type: Box
        layout: { span: 14, sm: { span: 24 } }
        blocks: [card with detail fields]
      - id: sidebar
        type: Box
        layout: { span: 10, sm: { span: 24 } }
        blocks: [tile cards]
```

**Edit page** — `hide_title: true`, centered card + floating actions:

```yaml
vars:
  hide_title: true
  blocks:
    - _ref:
        module: layout
        component: card
        vars:
          title: Edit {Entity}
          width: 700
          blocks: [form fields]
    - _ref:
        module: layout
        component: floating-actions
        vars:
          width: 700
          actions: [spacer, Cancel, Save]
```

**Tabbed workspace** — for complex domain pages (lot-view, ticket-view):

```yaml
blocks:
  - id: tabs
    type: Tabs
    properties:
      tabs:
        - { key: overview, title: Overview }
        - { key: documents, title: Documents }
    slots:
      overview:
        blocks: [_ref: components/overview-tab.yaml]
      documents:
        blocks: [_ref: components/documents-tab.yaml]
```

**Auth page** — branded login/signup:

```yaml
_ref:
  module: layout
  component: auth-page
  vars:
    id: login
    title: Login
    blocks: [email input, error alerts]
    actions: [login button]
```

## Anti-patterns

- **Don't skip the layout wrapper** — every page must wrap in `_ref: module: layout, component: page`. Raw pages without the shell lose the header, menu, notifications, and breadcrumbs.
- **Don't show everything at once** — if a page has more than 3 distinct content sections, use tabs or progressive disclosure (collapsed cards, sidebar tiles). Flat pages with 8 cards scrolling vertically violate "show only what matters now."
- **Don't use cards without purpose** — a Card should group related fields or actions. Don't wrap a single block in a Card just for the border. Don't nest Cards.
- **Don't forget responsive breakpoints** — two-column layouts must include `sm: { span: 24 }` so they stack on mobile/tablet. Three-column `flex` layouts need sensible min-widths.
- **Don't hardcode widths** — use `content_width` var on the page layout or `width` on cards. This keeps centering consistent and the design breathing room.
- **Don't add decorative elements** — no dividers, no ornamental icons, no "Welcome back!" text. If it doesn't help the user decide or act, remove it.

## Reference Files

- `modules/layout/components/page.yaml` — main page layout shell with all vars
- `modules/shared/layout/title-block.yaml` — title + change stamp Nunjucks template
- `modules/shared/layout/card.yaml` — card with doc metadata, skeleton, header/footer buttons, back button
- `modules/shared/layout/floating-actions.yaml` — sticky Affix action bar
- `modules/shared/layout/auth-page.yaml` — branded centered auth layout
- `.impeccable.md` — design principles, brand personality, aesthetic direction

## Template

```yaml
# Standard page with layout wrapper
_ref:
  module: layout
  component: page
  vars:
    id: {page-id}
    title: {Page Title}
    breadcrumbs:
      - home: true
        icon: AiOutlineHome
      - label: {Parent Page}
        pageId:
          _module.pageId: {parent-page}
      - label: {Current Page}
    page_actions:
      - id: {action}_button
        type: Button
        layout:
          flex: 0 1 auto
        properties:
          title: {Action}
          icon: {AiOutlineIcon}
          type: {primary|default}
        events:
          onClick:
            - id: {action}
              type: Link
              params:
                pageId:
                  _module.pageId: {target-page}
    doc:
      _request: get_{entity}.0
    events:
      onMount: []
      onMountAsync: []
    requests:
      - _ref: requests/{request}.yaml
    blocks:
      - {page content}
```

## Checklist

- [ ] Every page wraps in `_ref: module: layout, component: page`
- [ ] Breadcrumbs: home → parent (with `pageId`) → current label
- [ ] Edit pages use `hide_title: true` and show title via card
- [ ] Detail/edit pages pass `doc` var for change stamp display
- [ ] Cards use `width` for centered content (700 for forms)
- [ ] Floating actions include a spacer Box (`flex: 1 0 auto`) before buttons
- [ ] Two-column layouts include `sm: { span: 24 }` for responsive stacking
- [ ] Design check: does the page answer "What do I need to do next?" without scrolling?
- [ ] No decorative elements — every block earns its place
