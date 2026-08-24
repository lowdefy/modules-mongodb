---
'@lowdefy/modules-mongodb-ai-assistant': patch
---

The `ai-assistant` module now resolves its `scope` var each time it uses it — minting a thread, listing threads, saving one — rather than once when the page initialises. A scope operator whose value arrives late, such as one reading state populated by an async request, previously froze as null and partitioned every thread under the same empty scope.

The module still cannot see a scope that changes while the app is running, because nothing in it can observe an app global moving. The docs now carry the recipe for that case: compare `ai_scope` against your own source of truth in `onMount`, which runs on every visit, and clear the open thread when they differ.

`list-threads` now takes a `$limit` — the thread list is a sidebar with its own search, not an archive, and the pipeline previously grew with a user's whole history for the scope. The module docs also name the two indexes the threads collection wants, and the TTL index for expiring a thread a fixed time after its last activity: the module does not create them, and nothing breaks without them until the collection is large enough that it hurts.
