# Report visual polish (DRAFT)

> **Status: draft.** A starting sketch and open questions, not a settled plan.
> The problem is real; the approach below is one candidate, not a decision.

The open engine and `flint-chart` rendering make reports _correct_ and
_consistent_, but "consistent" is not the same as "good-looking". A saved report
today is a vertical stack of KPI tiles, tables, and compiled charts with the
module's default spacing and the compiler's derived styling. The goal here is to
raise the visual quality of what the module renders — layout, density, rhythm,
chart styling — to something that reads as a designed dashboard rather than a
dump of sections.

Relates to the existing [`ux/`](../../ux/design.md) wireframes (which framed the
chat + save-report flow) and the [`flint-charts`](../../flint-charts/design.md)
design (which owns chart appearance). This is the visual-quality follow-up to
both.

## Goal

A concrete, build-verified set of improvements to report presentation, arrived
at by designing against real wireframes rather than tweaking CSS in the dark.

## Candidate approach

1. **Wireframe strong report layouts first.** Produce a small deck of "what good
   looks like" — a KPI-row + chart-grid dashboard, a narrative single-column
   report, a dense operational table view. These are the target, independent of
   current output. (The `ux/` folder already has `wireframes.html` /
   `wireframes-blocks.html` as a starting point and format precedent.)
2. **Design pass with Fable + the lowdefy-docs MCP.** Have Fable use the
   lowdefy-docs MCP (live block schemas, examples, screenshots of the running
   app) together with the wireframes to propose specific changes: which Lowdefy
   blocks/layout props to change, section spacing/`gap`, KPI tile styling, chart
   grid vs. stack, theme tokens. The MCP is the grounding — proposals reference
   real block props and get screenshot-verified, not imagined.
3. **Land the changes as presentation-layer edits**, section by section, each
   `ldf:b`- and screenshot-verified against its wireframe.

## Open questions

- **Where does styling live?** How much of report appearance is fixed by the
  module vs. the `flint-chart` compiler vs. app theme tokens? A polish pass can
  only change what the module actually controls — needs mapping before the Fable
  pass, so proposals target the right layer.
- **Layout responsiveness.** Do target layouts (KPI row, chart grid) need to
  reflow for narrow viewports, and does the current section renderer support
  that, or is it a straight vertical stack today?
- **Scope of Fable's autonomy.** Is Fable proposing (human applies) or applying
  directly against the running dev server? Affects how the MCP + wireframes are
  handed over.
- **What is the acceptance bar?** "Looks good" needs a rubric — likely
  side-by-side against the wireframes, not a subjective call.

## Not yet decided

Whether this is one design or splits into "layout system" and "chart styling"
tracks. Decide after the wireframes exist — they will show whether the two are
separable.
