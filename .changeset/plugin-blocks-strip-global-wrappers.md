---
"@lowdefy/modules-mongodb-plugins": patch
---

Strip leftover `:global(...)` wrappers from the block stylesheets so their rules actually apply. When `ActionSteps`, `EventsTimeline`, `DataDescriptions` and `SmartDescriptions` were converted from `style.module.css` to a plain `style.css`, the rename kept the file content byte-for-byte — including the `:global(...)` wrapper around every selector. `:global()` is a CSS Modules construct, not valid CSS; in a plain stylesheet (processed with `modules: false`) css-loader passes it through verbatim, the browser sees an unknown pseudo-class, treats the whole selector as invalid, and drops the rule. So even though the side-effect import now reaches the production bundle, every styled rule was silently a no-op (badge layout, timeline rails, dataview value/link/tag/array styling).

Removed the `:global(...)` wrapper from each rule, leaving the inner selector. These classes (`action-steps-*`, `dataview-*`, `events-timeline-compact`) are already namespaced, so there is no module scope to escape in a plain stylesheet. No other blocks are affected: `ContactSelector` and `FileManager` ship no stylesheet, and there are no remaining `.module.css` files in the package.
