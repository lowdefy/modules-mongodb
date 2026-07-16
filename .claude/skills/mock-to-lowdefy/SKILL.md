---
name: mock-to-lowdefy
description: Turn a feature's HTML mockup into real Lowdefy page config through three mechanical phases — frame (structural wireframe) → layout (sizeless blocks + placeholder slots) → content (real blocks, mock data, TODO(request-substitute) markers). Use when converting a mock/mockup into Lowdefy YAML, or when a design's mockups/ screens need building into module/app pages.
---

# Mock → Lowdefy pipeline

Convert a detailed HTML mockup into real Lowdefy page config, on the app's shared
components, ready for request wiring. This is ONE skill with three phases run in
order — each a separate file under `phases/`. The discipline (sizeless structural
blocks, geometry from `layout:`, the placeholder-slot model, mechanical
frame→YAML translation) is what makes the output correct Lowdefy and clearly
beats an unguided agent; follow it faithfully.

## When to use

You have a mockup for a screen (authored by `lowdefy-mock`, or any hand/AI mock)
and need it as Lowdefy pages/components in a module or app. If you also have the
feature's **design spec**, keep it at hand — phase 3 needs it for the behaviour a
static mock can't show.

## The three phases — run in order

1. **`phases/01-frame.md` — mock → FRAME.** Abstract the mock into a structural
   wireframe in the frame dialect (a strict CSS system that replicates Lowdefy's
   layout engine). Geometry is derived from the mock's CSS and verified by
   rendering the frame beside the mock. Output: an html frame (+ preview png) in
   the design's `mockups/frames/`, committed for provenance — NOT app source.

2. **`phases/02-layout.md` — FRAME → Lowdefy layout.** Mechanically translate the
   frame into a Lowdefy block tree: structural blocks carry no size, every leaf
   becomes a sized `Html` placeholder slot carrying the block id. Starts with
   **shared-component discovery** — map regions onto the app's existing
   components before hand-rolling anything. Output: real Lowdefy YAML written
   into the target module/feature source (multi-file: page + `components/*.yaml`
   via plain-path `_ref`).

3. **`phases/03-content.md` — fill the slots.** Replace each placeholder slot with
   a real, mock-data-hydrated block (tables, inputs, tags, charts), matching the
   mock's visuals within the app's existing theme, consulting the design spec for
   behaviour, leaving a `TODO(request-substitute)` marker at every mock-data
   site. Output: the same page, content-complete, edited in place.

The pipeline **stops at the `TODO(request-substitute)` markers** — data/request
wiring is a separate wire task (`design-tasks-ui` emits it), not a phase here.

## Bundled references (the discipline the MCP doesn't teach)

- `assets/frame.css` — the frame dialect stylesheet (copy verbatim into frames).
- `references/frame-dialect.md` — the dialect's structure rules and invariants.
- `references/lowdefy-layout.md` — the 24-column engine, the align/selfAlign
  release shim, the breakpoint cascade, geometry anti-patterns.
- `references/lowdefy-blocks.md` — the structural block model, where `style:`
  lands, Card `.body` padding, the repetition family, the page-shell 104px
  compensation.
- `references/input-blocks.md` — the default input/control vocabulary.

## Block knowledge comes from the `lowdefy-docs` MCP — not guides

Per-block schema, props, examples and docs are resolved via the `lowdefy-docs`
MCP (served by the Lowdefy dev server, release-exact, including local plugins):
`lowdefy_list_types`, `lowdefy_get_schema`, `lowdefy_get_examples`,
`lowdefy_search_docs`, `lowdefy_get_doc`, plus the live-app tools
`lowdefy_build_status`, `lowdefy_get_page_config`, `lowdefy_screenshot_page`.
The bundled references above carry the layout _discipline_ the MCP doesn't teach;
the MCP carries everything block-specific. This skill does not depend on
`.claude/guides/` or the `r:lowdefy-*` skills, so it stays portable across every
Lowdefy project. (The MCP ships with the dev server; the developer runs it —
phase 3's live-app validation assumes it is up.)

## What this skill deliberately does not do

- No theme derivation from the mock — a module doesn't own the app theme
  (phase 3).
- No request/data wiring — that is the wire task the markers hand off to.
- No grading scaffolding — no region tags, no `er_` ids, no forced placeholder
  palette. Ids are real descriptive snake_case block ids; slots inherit the app
  theme.
