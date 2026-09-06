# Task 1: Expose the validator's collection enumeration for withheld-vs-broken classification

## Context

`compileReport` needs to tell two failure modes apart for a section that failed to resolve:
**broken** (spec drifted out of the catalog, pipeline no longer validates) vs **withheld** (the
section is valid, but the viewer's roles don't satisfy a role-gated collection it queries). Today
both land in the resolver's per-section `:catch`, which receives no error object, so they render
the same Alert.

The engine already owns the exact access predicate. `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js`:

- `checkCollectionAccess(name, ctx)` (line 210) is the single choke point every gated collection
  passes through: it verifies catalog membership (`fail()` if the collection isn't in
  `ctx.catalog`, line ~215) and enforces the union-of-roles gate
  (`const required = ctx.catalog[name]?.roles ?? []; if (required.length > 0 && !required.some((r) => ctx.userRoles.includes(r))) fail(...)`, lines 221-223).
- It is called for the base collection (`validatePipeline`, line 1007) and for every
  `$lookup.from` (line 709). Sub-pipeline recursion spreads `ctx` (line 743:
  `{ ...ctx, collection: arg.from, scope, subDepth: ctx.subDepth + 1 }`), so a nested `$lookup`
  inside a `$lookup` sub-pipeline still routes through the same `checkCollectionAccess`.
- `ctx` is built in `validatePipeline` (lines 998-1006); `validatePipeline` returns
  `{ collection, pipeline }` (line 1008).

Because `checkCollectionAccess` is where every collection is gated, **recording each collection
there is complete by construction** — including any collection-bearing stage added later, which
must route through it to be validated at all. That is the design's "one call site that already
visits every stage."

The subtlety this task must solve: the withheld case is _exactly_ a pipeline that contains a
role-denied collection, so a normal `validatePipeline` call over it **throws** at the denied
collection before the walk finishes. To classify, the caller must be able to enumerate the
touched collections **without** the role gate throwing.

## Interfaces

- **Produces:** an exported way to obtain, for a `{ collection, pipeline }` + `catalog`, the set
  of catalog collections the validator's walk touches, computed by the _same_ walk and **without
  triggering the role-gate `fail()`**. Recommended shape — a named export
  `touchedCollections({ collection, pipeline, catalog })` returning a `string[]` (or `Set`), plus
  the underlying `ctx.touchedCollections` accumulation inside `checkCollectionAccess`. Task 5
  consumes this to compute required-roles and compare against the viewer's roles itself.

## Task

In `validatePipeline.js`:

1. Add `touchedCollections: new Set()` to the `ctx` object (lines 998-1006). The sub-pipeline
   recursion at line 743 spreads `ctx`, which copies the Set **by reference** — so nested walks
   accumulate into the same Set. Do not create a new Set on recursion.
2. In `checkCollectionAccess` (line 210), record the collection: `ctx.touchedCollections.add(name)`.
   Record it for its catalog-membership check — a collection absent from the catalog is a
   **broken** condition, so keep that `fail()` as-is (do not suppress it). Only the _role_ gate is
   the one a collect-only pass must skip (next step).
3. Add a collect-only mode. Introduce a `ctx` flag (e.g. `ctx.collectOnly`) that makes
   `checkCollectionAccess` **skip the role-gate `fail()`** (lines 221-223) while still recording
   the name and still enforcing catalog membership. Export an entry that runs the standard walk
   with `collectOnly: true` and returns `ctx.touchedCollections` — e.g.:
   ```js
   export function touchedCollections({ collection, pipeline, catalog }) {
     // same ctx construction as validatePipeline, with collectOnly: true and roles irrelevant
     // returns [...ctx.touchedCollections]; throws only on genuine grammar/catalog-membership faults
   }
   ```
   Reuse the existing walk (`validateSubPipeline` / the `checkCollectionAccess` call sites) — do
   **not** write a second traversal.
4. Leave the default `validatePipeline` behaviour unchanged: `collectOnly` defaults to falsy, the
   role gate still throws, and the returned shape stays `{ collection, pipeline }` (adding
   `touchedCollections` to the return is optional and harmless, but not required by any consumer).

## Acceptance Criteria

- A pipeline that touches a role-gated collection the caller's roles do NOT satisfy: normal
  `validatePipeline` still throws (gate unchanged); `touchedCollections(...)` returns the full set
  including that collection **without throwing** on the role gate.
- The set includes the base collection, every `$lookup.from`, and a `$lookup` nested inside
  another `$lookup`'s sub-pipeline. Add a vitest case per stage kind in
  `validatePipeline.test.js` (or the nearest existing test file for this module).
- A pipeline referencing a collection **absent from the catalog** still throws (broken, not
  withheld) even under collect-only.
- Existing `validatePipeline` tests pass unchanged. Run: `CI=true pnpm test` for the plugins
  package (sandbox off — Mongo-backed suites fail spuriously in the sandbox).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js` — modify: accumulate `touchedCollections` in `checkCollectionAccess`; add collect-only mode; export the enumeration entry.
- `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.test.js` — modify/create: per-stage enumeration tests + the collect-only-doesn't-throw-on-role-gate case.

## Notes

- The reason to record _inside_ `checkCollectionAccess` rather than scanning stage types in a
  helper: it is the only place a collection is admitted, so it cannot miss a stage the validator
  accepts — now or after a future stage (e.g. `$unionWith`, `$graphLookup`) is allowed. A helper
  that re-walks the pipeline is the exact drift the design forbids.
- `$unionWith` / `$graphLookup` may not be accepted stages today; that's fine — the point is the
  enumeration stays correct if they ever are, for free.
