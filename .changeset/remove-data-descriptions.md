---
"@lowdefy/modules-mongodb-plugins": patch
---

Remove the unused `DataDescriptions` block from `@lowdefy/modules-mongodb-plugins`. The block was exported by the plugin but not referenced by any module or app in this repo; `SmartDescriptions` covers the in-repo use cases. Consumers still importing `DataDescriptions` from this plugin should switch to `SmartDescriptions` or pin to `^0.1.1`.
