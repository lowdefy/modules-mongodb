---
"@lowdefy/modules-mongodb-plugins": minor
---

Add multi-select report filters, with `any`/`all` matching over scalar and array fields, and filters whose options are looked up from another collection rather than typed or cataloged by hand — a foreign-key filter that shows names instead of ids, a pre-filtered list, or the distinct values of an array field. The looked-up list resolves on every report open, through the same pipeline validation and per-viewer role gate as any section's query.

`MAX_ARRAY_LITERAL_LENGTH` moves from 100 to 500. This widens what an AI-authored pipeline may type into one `$in`/`$nin`/`$all` array literal — pipeline **text**, not result size — so it stays under the byte (`MAX_PIPELINE_BYTES`) and node (`MAX_PIPELINE_NODES`) budgets, which are unchanged. It moves because a full multi-select selection compiles to one such operand in the server-built filter `$match`, and the new query-sourced filter option cap (`MAX_QUERY_FILTER_OPTIONS`, 500) must fit under it or an ordinary full selection would be silently rejected.

Two behaviours worth knowing before using these:

A bound filter matches **documents**, not array elements — a section that `$unwind`s the filtered array still sees every element of a matching document, not just the ones that matched.

An options query's `valueKey` must project a string or a number. The value travels to the browser and back before reaching the filter `$match`, and an ObjectId does not survive that trip — it arrives as a bare hex string and no longer equals the ObjectId in the field. That would otherwise be a filter listing the right names and matching nothing, silently, so a non-scalar `valueKey` now fails the options contract and renders as an Alert naming `$toString`.

The catalog enum `values` a filter falls back on are now role-gated: a collection the viewer may not query contributes no options. This also closes the same gap on the pre-existing `select`-filter fallback path.
