---
"@lowdefy/modules-mongodb-plugins": minor
---

`MessageComposer` has Playwright helpers, so an app's e2e specs can drive it with `ldf.block(id)`: `do.fill(text)`, `do.clear()`, `do.send()` (presses the composer's Send), `get.value()` and `expect.value(text)`. The plugin exports them from `@lowdefy/modules-mongodb-plugins/e2e`, where `@lowdefy/e2e-utils` looks them up. Nothing to change in your app.
