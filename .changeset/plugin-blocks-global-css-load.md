---
"@lowdefy/modules-mongodb-plugins": patch
---

Fix block styling never reaching the app. ActionSteps, EventsTimeline, DataDescriptions and SmartDescriptions each shipped their global CSS via a `style.module.css` imported only for side effects (`import "./style.module.css"`). Vite/Rollup tree-shakes such an import — the CSS-module proxy is treated as side-effect-free because its exported class map is unused — so none of the `:global(...)` rules were emitted into the client bundle (badge stacking, timeline rails, dataview value styling all silently missing). Every selector in these files was already `:global(...)`, so they were CSS modules in name only. Renamed each to a plain `style.css` and import it as a plain global stylesheet, which Vite always keeps.

Also fix ActionSteps action items wrapping side-by-side: the per-group actions now render in a flex-column container so they stack regardless of stylesheet loading.
