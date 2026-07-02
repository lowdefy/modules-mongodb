---
"@lowdefy/modules-mongodb-events": patch
---

**Fix: events-timeline connection ConfigError on default vars** — `actions_collection` and `contacts_collection` defaulted to `null`, but the `EventsTimeline` connection schema requires strings, so `get-events` threw `[ConfigError] property "actionsCollection" must be type "string"` at request time whenever a consumer left the vars unset. The var defaults are now the real collection names (`actions`, `user-contacts`) so the connection resolves to valid strings out of the box.
