---
"@lowdefy/modules-mongodb-plugins": patch
---

Align the suite to lowdefy 5.5.1 and migrate block stylesheets to CSS Modules.

Blocks that shipped a global `style.css` — `ActionSteps`, `DataDescriptions`,
`EventsTimeline`, `SmartDescriptions`, `WorkflowProgress` — now import a
`style.module.css` whose selectors are wrapped in `:global(...)` inside
`@layer components`, matching the convention used by the official
`@lowdefy/blocks-antd` blocks. The Turbopack build in lowdefy 5.5.1 rejects
global-CSS imports from transpiled first-party packages; the rendered class
names are unchanged, so consumers see no visual difference.
