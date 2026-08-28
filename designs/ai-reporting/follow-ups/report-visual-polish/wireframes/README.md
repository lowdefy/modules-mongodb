# Report layout wireframes

Aspirational targets for report presentation — step 1 of the candidate approach
in [`../design.md`](../design.md): "what good looks like", independent of what
the renderer produces today. Published as an editable design canvas:

**https://claude.ai/code/artifact/7f337cc2-8e48-4460-8980-985af20e457a**

The `.dc.html` files here are the canvas source (one file per artboard,
`canvas.json` is the layout); each is plain HTML inside the `<x-dc>` wrapper,
so the markup is readable directly even though the files don't render
standalone. Sample data is fictional.

## The three archetypes

| Artboard              | Archetype                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Main.dc.html`        | **Dashboard** — filter row, KPI band, 7/5 chart-grid row, full-width trend line, table, download footer.                                          |
| `Narrative.dc.html`   | **Narrative report** — markdown-led single column on a centered paper surface: prose, hero KPI, numbered figures, compact table.                  |
| `Operations.dc.html`  | **Dense operational view** — compact header, divider-strip KPIs, small-multiples strip, dense urgency-sorted table.                               |

## Grounding

Every element maps to the existing section vocabulary (`kpi`, `chart`,
`table`, `filter`, `markdown`, `download`) and respects the presentation
contract (value-descending bars, humanized labels, legend on multi-series,
numeric right-alignment, max 3 filters per row) — **except** two flagged
proposals for the design pass:

- **Side-by-side section widths** (the dashboard's 7/5 chart row, paired
  KPIs in the narrative). Today's renderer stacks query sections vertically;
  only KPI tiles and filters share rows.
- **KPI delta captions** (`+12% vs Q2`). The KPI contract today is
  label + `valueKey` + `format`; a caption needs either a spec addition or a
  second query.

Series palette (`#0b7a5c`, `#8c5bb0`, `#b0722a`, `#3f6fae`) passes the
colorblind-separation / lightness / contrast checks against the `#fcfcfb`
surface. Light theme only — these are targets, not a theming spec.
