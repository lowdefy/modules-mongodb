---
"@lowdefy/modules-mongodb-companies": minor
---

Remove the `data-upload` module. The module has been deleted from the repo along with its pages, components, requests, connections, menus, and event-type enums. Consumers using `data-upload` should pin to the previous release tag or vendor the module locally. Cross-references from `modules/shared/enums/event_types.yaml`, `apps/demo/modules.yaml`, the root `README.md`, `docs/idioms.md`, and the demo `.claude/guides/*.md` have been removed. The `SYNC_S3_*` secrets are no longer documented.
