---
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-events": minor
"@lowdefy/modules-mongodb-files": minor
---

Remove the `collection` var from the `companies`, `events`, and `files` modules. Each module's MongoDB collection name is now hardcoded in its connection file (`companies`, `log-events`, `files` respectively). Consumers can no longer rename the underlying collection through `vars.collection` — to point a module at a different collection, remap its connection (`companies-collection`, `events-collection`, `files-collection`) via the module entry's `connections` mapping in `lowdefy.yaml`.

**Breaking:** apps that previously set `vars.collection` on any of these modules must remove it. If a non-default collection name was in use, switch to a `connections` remap on the module entry.
