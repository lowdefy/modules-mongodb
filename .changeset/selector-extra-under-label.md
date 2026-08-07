---
"@lowdefy/modules-mongodb-workflows": patch
---

Fix `selector` form component so its `extra` helper text renders. `extra` was being passed as a top-level block property instead of under `label`, where the Selector block reads it — so the helper text never showed. It now nests under `label`, matching every other field component.
