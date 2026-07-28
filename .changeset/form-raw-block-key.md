---
"@lowdefy/modules-mongodb-workflows": minor
---

Raw blocks in an action `form:` now use `key`, not `id` — which is what makes their submitted values round-trip.

A raw inline Lowdefy block (a `form:` entry with no `component:`) was documented as carrying its real `id`, on the reasoning that the id doubles as the state path just like a library component's `key`. That is true of the block tree, but it misses the second consumer of the authored `form:` array: the `form_meta` projection records only `component`/`key`/`required`/`title`/`validate`, and `GetWorkflowAction` allowlists the stored `form_data` slice by those keys. An entry with a bare `id` and no `key` has no `form_meta` entry, so its value **saved but was never read back** — blank on re-edit, and absent from the overview and review views.

Raw entries now share the library's authoring vocabulary: `key` becomes the block id (and the `form_meta` key), and `title` is the overview/review display label. Both are stripped before the node reaches the page tree, since neither is a valid Lowdefy block property. Writing `key` and `id` on the same entry is now an error, as is a non-string `key`.

This also makes **consumer-supplied field components** work. An app that needs a field the library doesn't cover, reused across several of its own actions, can now own a component file that emits a form entry and `_ref` it from the app-side workflow config — the ref resolves in app context, so it is not subject to the constraint that a module ref cannot escape its package root. Those components get full parity with the built-in library: state binding, value round-trip, overview rendering, id-collision checking, and `viewOnly`.

Existing raw blocks authored with `id` keep building and rendering exactly as before — they were already not round-tripping, so nothing regresses. Switch them to `key` to fix prefill and display. The `key` → `id` mapping applies at `form:` entry positions only (top-level entries, and the `form:` of a structural component); inside a raw block's own `blocks:` array, keep using `id`.
