# Phase 1 — mock → FRAME

First phase of the pipeline (mock → **frame** → layout → content). You are
abstracting a detailed HTML mock into a FRAME: a structural wireframe in the
frame dialect (`references/frame-dialect.md` + `assets/frame.css`) — a strict
CSS system that replicates the Lowdefy layout engine. The frame is two things at
once:

1. **A geometry contract.** Rendered at 1440px, its region boxes reproduce the
   mock's layout. Fidelity lost here is never recovered downstream.
2. **A human-editable design surface.** Developers open the rendered frame,
   point at an area BY ITS ID (every area renders its own id), and prompt for
   changes — "split `activity_body` into two columns", "remove `legend`".
   Author the frame so areas are easy to address, split, and delete: one element
   per visual area, descriptive ids, flat simple nesting.

## The one law: geometry is DERIVED from the mock's CSS, never guessed

There is no measured answer key. Every number comes from the mock's own CSS:
spans from its column ratios, gaps and paddings from its real spacing values,
leaf heights from the content they replace. You verify the frame by **rendering
it beside the mock** (below), not against a table. The discipline is: derive
faithfully, never hallucinate geometry, and never nudge a drift with margins —
if a position is off, the STRUCTURE is wrong; fix the structure.

## Method — in order

1. **Read the mock** (html + every stylesheet it references). Work from the CSS,
   not a screenshot — constants drive the frame.
2. **Extract skeleton constants from the CSS:** nav height, wrapper
   max-width/margin/padding, section gaps, grid column ratios, card paddings.
3. **Note shared-component tags.** If the mock marks areas with
   `data-ldf-component="<id>"` (see the `lowdefy-mock` skill), carry each tag
   onto the corresponding frame element as the same attribute. It tells the
   layout phase "this region is an existing app component, not hand-rolled
   chrome" — you still draw its box for geometry, but you preserve the marker.
4. **Build the skeleton:**

   ```html
   <body>
     <div class="r">
       <div class="c" id="page">
         <div class="r">
           <div class="c shell" id="shell" style="height:58px"></div>
           <div
             class="c"
             id="content"
             style="max-width:1240px; margin:0 auto; padding:26px 26px 80px"
           >
             <div class="r" style="--g:16px">… areas …</div>
           </div>
         </div>
       </div>
     </div>
   </body>
   ```

   Check: shell height + wrapper padding-top = the mock's first content y
   (`58 + 26 = 84` — if the mock's first section starts elsewhere, your
   constants are wrong).

5. **Compute spans** — siblings sum to 24 per visual row, from the mock's column
   ratios (`references/frame-dialect.md` has the ratio table). Verify: span N in
   a row of content width W with gap g renders `N/24·(W+g) − g` wide.
6. **Size the leaves** so each container's derived height matches the mock's:
   padding + Σ(ph heights) + gaps = container height.
7. **Audit y by arithmetic.** Walk top-to-bottom with a y-cursor
   (`y += height + gap`, plus paddings on entry); compare each region's computed
   y against the mock. Drift compounds — a 14px error in one row puts everything
   below it off. Fix drifts structurally.
8. **Render the frame beside the mock and compare.** Open both at 1440px; the
   frame's boxes should track the mock's areas. Where they diverge, the frame's
   structure is wrong — fix it, never paper over it with a margin.

## Derive the layout — never mirror the mock's DOM

The mock's markup is often wrapper soup (generator output, legacy nesting). You
are extracting the LAYOUT, not transliterating divs: a chain of single-child
wrappers collapses to ONE frame element (sum paddings, keep one gap); a wrapper
that adds no span, no padding and no alignment does not exist in the frame. The
frame should have the FEWEST elements that reproduce the geometry.

## Sizing doctrine: containers derive, leaves declare

**No width or height on containers** — a container's size emerges from its
children, paddings and gaps, exactly as it will in the Lowdefy app (the layout
phase forbids sizes on structural blocks too; keeping the frame honest here is
what makes frame ≈ app). Explicit sizes live ONLY on `.ph` leaves (height
always; width when content-sized) and the `.c shell` stub (height = the mock
nav's real height). When a mock container is taller than its content adds up to,
absorb the slack by growing a `.ph` inside it — never by pinning the container.

Rows stretch children to the tallest sibling by default — class `top` on
unequal-height rows keeps short areas from inflating. Titlebars and multi-column
content grids virtually always need it.

## Interaction states (modals, drawers, tabs, collapse)

When the mock has overlay or revealed content, express each state as a separable
layer per `references/frame-dialect.md` ("Interaction states"): an `.ovl` layer
holding one panel `.c` for modals/drawers; `data-ldf-layer` /
`data-ldf-layer-hide` for in-place tab/collapse swaps. Triggers stay in the base
page. A modal panel's x/y comes from centering math
(x = (1440 − panel width) / 2); audit it like any base row.

## Recipes

**Titlebar** (title left, actions right, top-aligned; the cluster's height
derives from its buttons):

```html
<div class="c" id="titlebar" style="--s:24">
  <div class="r top sb">
    <div class="fi ph" id="title_text" style="width:420px; height:60px"></div>
    <div class="fi" id="title_actions">
      <div class="r" style="--g:10px">
        <div
          class="fi ph"
          id="new_connection_btn"
          style="width:106px; height:33px"
        ></div>
      </div>
    </div>
  </div>
</div>
```

(`sb` pushes the action cluster right — no spacer element needed.)

**KPI strip** (6-up; card height derives from padding + value/label phs):

```html
<div class="c" id="kpi_strip" style="--s:24">
  <div class="r" style="--g:12px">
    <div class="c card" id="kpi1.kpi_card" style="--s:4; --sm:12">
      <div class="r" style="padding:14px 16px; --g:4px">
        <div class="c ph" id="kpi1_label" style="height:14px"></div>
        <div class="c ph" id="kpi1_value" style="height:27px"></div>
      </div>
    </div>
    <!-- kpi2…kpi6 identical; audit: 14+14 padding + 14+4+27 = 73 ≈ mock card h -->
  </div>
</div>
```

(Repeated instances get dot-ids — `kpi1.kpi_card`, `kpi2.kpi_card` — so ids stay
unique; the final dot-segment is the shared role name.)

**Unequal two-column grid** (`top` on the row; columns hug their content):

```html
<div class="c" id="content_grid" style="--s:24">
  <div class="r top" style="--g:16px">
    <div class="c card" id="steplog_card" style="--s:14">…</div>
    <div class="c" id="right_col" style="--s:10">
      <div class="r" style="--g:16px">
        <div class="c card" id="details_card">…</div>
        <div class="c card" id="variables_card">…</div>
      </div>
    </div>
  </div>
</div>
```

## Checklist before emitting

- [ ] Every `.c`/`.fi` has a unique descriptive snake_case id (dot-ids for
      repeated instances); these are the real block ids the next phase copies
- [ ] Any `data-ldf-component` tags from the mock carried onto their frame areas
- [ ] Shell height + wrapper padding-top == the mock's first-region y
- [ ] Sibling `--s` values sum to 24; spans derived from the mock's column ratios
- [ ] NO width/height on containers — sizes only on `.ph` leaves + shell stub
- [ ] `top` on every row with unequal-height children
- [ ] y-cursor audit done; frame rendered beside the mock and matches
- [ ] Column splits use `--sm` (default 24 = stack); no `.ph` width > 350px
- [ ] Zero text nodes; every leaf is a `.ph` with an explicit height
- [ ] `<style>` is `assets/frame.css` verbatim, nothing else

## Output & where it lives

One self-contained html file (inline `<style>` = `assets/frame.css` verbatim, no
scripts, no external refs). Frames are **design intermediates** — write them to
the design's `mockups/frames/` folder (html + a preview png), committed for
provenance. They are NOT shipped into the app source; only the Lowdefy YAML from
phase 2 onward is the product.
