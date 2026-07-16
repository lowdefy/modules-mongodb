---
name: lowdefy-mock
description: Author a pipeline-ready HTML mockup for a Lowdefy feature — one canonical 1440px mock in the app's Ant Design look, one element per semantic area, shared components tagged, interaction states as separable layers. Use when creating or normalising a mockup that the mock-to-lowdefy pipeline will consume. Doubles as a normaliser for an existing hand/AI mock.
---

# Author a pipeline-ready mock

Produce an HTML mockup that the `mock-to-lowdefy` pipeline can consume **by
construction** — so the frame phase's areas and ids fall out of the mock's
structure directly, rather than being reverse-engineered from wrapper soup.
Authoring is the primary mode; normalising an existing hand/AI mock is the
secondary mode (same rules, applied as edits).

This is a **standalone** authoring skill — invoke it directly. It is not wired
into any design tool's visual companion (see "Not this skill's job").

## The output: one canonical mock

- **One 1440px-wide HTML file** with self-contained CSS (inline `<style>` or a
  co-located stylesheet), no external requests. The pipeline reads the CSS for
  exact geometry, so the CSS must be the source of truth — real column ratios,
  real gaps, real paddings, real heights.
- **One element per semantic area, with clean grouping.** Each visual area
  (titlebar, filter bar, a KPI card, a table, a sidebar tile) is ONE element with
  a clear role — not a nest of presentational wrappers. Group siblings the way
  the layout groups them (a row of KPI cards is one row container holding N card
  elements). This is what makes the frame's one-element-per-area rule trivial.
- **Spacing from a small consistent scale** (e.g. 4 / 8 / 12 / 16 / 24 / 32) —
  reused everywhere, so gaps and paddings are predictable and the frame's numbers
  come out clean.
- **Descriptive ids/classes naming each area's role** (`titlebar`,
  `members_filters`, `members_table`, `activity_tile`) — snake_case, matching
  what you'd want as the eventual Lowdefy block ids. The frame phase copies these.

## App look — read as the Lowdefy Ant Design app it will become

The mock should look like the antd/Lowdefy app, so the eventual visual
comparison is meaningful and shared-component regions are recognisable:

- Use antd-style components and spacing where accurate — card surfaces with
  subtle borders and ~small padding, antd control heights (~32px default,
  ~24px small), the antd type scale, tag/pill shapes, table row heights.
- Match the app's density. Internal apps run antd's `compact` algorithm — favour
  tighter spacing over generous marketing-site whitespace.
- Don't invent a new visual language; you are drawing the app, not a brand site.

## Shared-component tagging (the repo-specific move)

Where an area maps to a component the app already provides, TAG it so the frame
and layout phases reuse it instead of hand-rolling chrome:

- Put `data-ldf-component="<component-id>"` on the area's root element. The value
  is the component's id as it appears in a module's `exports.components` or under
  `modules/shared/layout/` or an app-local `/components/` folder — e.g.
  `data-ldf-component="page"` (the layout page wrapper),
  `data-ldf-component="title-block"`, `data-ldf-component="pagination"`,
  `data-ldf-component="sort-filters"`, `data-ldf-component="card"`.
- To discover what exists, enumerate `exports.components` across
  `modules/*/module.lowdefy.yaml`, plus `modules/shared/layout/` and app-local
  `/components/`. The always-there fixed set is the `layout` module's exports
  (`page`, `card`, `floating-actions`, `auth-page`). Tag an area only when it
  genuinely IS that component — a title bar with an actions slot is
  `title-block`; a bespoke one-off is not.
- You still draw the area's real geometry inside the tag (the frame needs its
  box); the tag just records "this region is an existing component." The layout
  phase reads the tagged component's `vars`/`slots` contract from its YAML before
  wiring the `_ref`.

## Interaction states — explicit, separable layers

A static mock must still express modal/drawer/tab/collapse states so the pipeline
can carry them. Draw each state as a SEPARABLE layer that can be shown or hidden
independently, not baked into the base layout:

- **Modal / drawer:** an overlay layer (a full-viewport backdrop holding one
  panel element) that sits at the end of the document, toggleable — not a block
  wedged into the content flow. Give the panel a real width; center a modal, pin
  a drawer to an edge.
- **Tabs / collapse:** draw the base (resting) panel and each alternate panel as
  sibling layers occupying the same slot, one shown at a time. Mark which is the
  resting state.
- **Triggers stay in the base layout** — the button/tab/header that opens a state
  is ordinary base content.
- Keep every state's content to the SAME semantic-area discipline — one element
  per area — so the frame phase can lift each layer cleanly.

## Method

1. **Gather intent** — the design spec / screen description, and the app look
   (open an existing app page or the demo for reference on antd density and
   shared components).
2. **Discover shared components** to tag (enumerate as above).
3. **Lay out the base screen** at 1440px: page shell region (if the app has top
   nav), then content areas top-to-bottom, one element per area, grouped into
   rows/columns with a consistent spacing scale. Tag shared-component areas.
4. **Add interaction states** as separable layers.
5. **Self-check** against the checklist, then hand off to `mock-to-lowdefy`
   (phase 1 consumes this file).

## Where it lives

Write the mock into the design's `mockups/` folder (e.g.
`designs/<feature>/mockups/screens/<screen>.html`), committed for provenance.
Mockups are design intermediates, not app source.

## Checklist before handing off

- [ ] One 1440px HTML file, self-contained CSS, no external requests
- [ ] One element per semantic area; areas grouped as the layout groups them
- [ ] Spacing from one small consistent scale; real geometry in the CSS
- [ ] Descriptive snake_case ids/classes naming each area's role
- [ ] Reads as the antd/Lowdefy app (component styles, density, type scale)
- [ ] Shared-component areas tagged `data-ldf-component="<id>"`
- [ ] Every interaction state drawn as a separable, toggleable layer; triggers in
      the base layout

## Not this skill's job

- Grading tags, pixel-measurement answer keys, or a forced placeholder palette —
  that is eval scaffolding, absent by design. The mock's clean structure makes
  the geometry obvious; numbers follow from structure, they are not an input.
- Visual-companion integration — a project-local skill can't be invoked by an
  upstream visual-companion skill, and their fidelity/storage models differ. This
  is a persisted, antd-accurate, pipeline-ready mock, not a throwaway wireframe.
