---
"@lowdefy/modules-mongodb-deals": patch
---

Related-deal names wrap to two lines, and both deal-detail grids keep even columns and equal-height cards.

Two fixes to the related-deals grid, one visible and one structural.

The grids used `grid-template-columns: 1fr 1fr`, which is `minmax(auto, 1fr)` — the `auto` minimum floors each column at its content's min-content width. The compact card's deal name was `white-space: nowrap`, so its min-content was the whole untruncated name: a long name widened its column instead of being clipped, leaving the pair uneven. Measured in a 556px container, the name rendered 467px and unclipped; `minmax(0, 1fr)` clips it at 256px with the columns even.

The name now clamps to **two lines** rather than ellipsising on one. That matches the open-items card beside it and shows more of the name — the single line was a constraint of the earlier fixed-width scrolling strip, which pagination replaced, so it no longer bought anything. Related-deal cards gain `gridAutoRows: 1fr` and `height: 100%` so a one-line name doesn't sit shorter than a two-line neighbour, the same pairing the open-items grid already uses.

Both grids get the column fix. Only related deals showed the symptom, since the open-items card already clamped rather than using `nowrap`, but the same floor would apply to any non-wrapping row added later.
