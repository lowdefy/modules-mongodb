---
"@lowdefy/modules-mongodb-ai-reporting": minor
"@lowdefy/modules-mongodb-plugins": minor
---

ai-reporting: make a saved report read as a designed page, on Lowdefy 6.0.0

A saved report rendered as a vertical stack of bare numbers, grids and canvases: every
compiled block a sibling in one wrapping area, one number alone on a line, two small
charts one under the other, every section the same width whatever it held. Its charts
shipped the stock ECharts palette with 10px axis labels, square bars, hairline lines and
touching pie slices, laid out for a constant 1100px canvas they were never drawn at.

**Layout is derived, never authored.** Width, pairing, spans and heights are computed on
every open from a section's type, its position in its run of same-type neighbours, and the
shape of the rows the first unfiltered resolve returned. Numbers pack into a KPI row, two
narrow charts placed together pair up and share one height, an unpaired one is promoted to
full width, a table always runs full width. Adjacency in spec order is the agent's only
channel into layout. No new spec key was added: a `width: full|half` key was considered and
rejected, because an authored width freezes at save and goes wrong the moment the data
behind it moves. Existing reports pick the new layout up on their next open.

**Charts.** A validated 8-slot palette, rounded bar caps capped once per stack, 2px lines
with an endpoint symbol, gradient area fills, pie slice gaps with a 6 + neutral `Other`
cap, a legend banded above the plot where a vertical one would eat a narrow canvas, and
axis-label rotation that only ever relaxes Flint's decision. A shared theme
(`defaults/chart_theme.yaml`) carries typography, axis chrome and a transparent
background to all three render sites, including the chat card and expand modal, and is
inked from the reader's colour mode. Colour identity is scoped to the report rather than
the chart: every coloured entity gets one hue in first-appearance order, threaded through
the re-query payload so a filter cannot repaint the survivors.

**Sections.** Each data section compiles into a card with its heading and ⤓ outside it.
Markdown and tables take no card. A filter group closes with one muted scope line plus
**Reset**, which clears state without re-querying, instead of a note on every control. A
run of `download` sections becomes one titled Downloads card.

**Requires Lowdefy 6.0.0**, the first release on the Vite/Hono line. It carries the
`blocks-echarts` theme fix (lowdefy/lowdefy#2358) that charts need to re-ink when dark mode
is toggled; on an older build they keep their first-render colours until a reload. The
plugin package's Lowdefy peer range now accepts `6.0.0` and no longer accepts the
`0.0.0-experimental-*` builds that stood in for it.
