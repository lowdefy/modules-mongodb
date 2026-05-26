# Task 1: Upstream Lowdefy PR — `UserError.isReject` + transparent `:reject` propagation

## Context

This part of the workflows module needs Lowdefy's `:reject` control to propagate as a throw across nested routine boundaries without losing its reject identity. Today both `:reject` and `:throw` end up constructing the same `UserError` shape, and `runRoutine.js`'s catch reclassifies every caught throw as `{ status: 'error' }` — so by the time a `:reject` has crossed any routine boundary as a throw, the discriminator is gone.

The fix is small and local. It belongs in the Lowdefy repo, not the workflows module, and must merge before Part 29's `:reject` integration path can work end-to-end (per design § Upstream dependency).

Repo: `/Users/sam/Developer/lowdefy/lowdefy` (sibling checkout).

## Task

Open a single PR against the Lowdefy repo with three small edits:

1. **`packages/utils/errors/src/UserError.js`** — accept `isReject` in the constructor's options object, default `false`, assign to `this.isReject`.

   ```js
   class UserError extends Error {
     constructor(message, { blockId, cause, isReject = false, metaData, pageId } = {}) {
       super(message, { cause });
       this.name = 'UserError';
       this.isLowdefyError = true;
       this.blockId = blockId;
       this.isReject = isReject;
       this.metaData = metaData;
       this.pageId = pageId;
     }
   }
   ```

2. **`packages/api/src/routes/endpoints/control/controlReject.js`** — pass `isReject: true` when constructing the `UserError` (line 40):

   ```js
   const error = new UserError(message, { cause, isReject: true });
   ```

   `controlThrow.js` stays unchanged (no flag → `isReject: false`).

3. **`packages/api/src/routes/endpoints/runRoutine.js`** — rewrite the catch (lines 56-62) to branch on `isReject` *before* `context.handleError` runs, so propagated rejects bypass `handleError` (preserving today's invariant: rejects never hit `handleError`) and only errors trigger it. Matches the routine-loop early-return at line 49, which also skips `handleError` for in-routine rejects.

   ```js
   } catch (error) {
     if (error.isReject) {
       return { status: 'reject', error };
     }
     if (!error.handled) {
       await context.handleError(error);
       error.handled = true;
     }
     return { status: 'error', error };
   }
   ```

Add tests for the four behaviours (UserError carries the flag; controlReject sets it; runRoutine reclassifies `isReject` throws as `'reject'`; runRoutine does not invoke `context.handleError` for `isReject` throws). The PR description should call out two semantic notes from Part 29's design: (a) today a `:reject` that propagates past its own routine becomes an outer `'error'` — with the tweak it stays a `'reject'`; (b) `context.handleError` continues to fire only on infrastructure errors, never on propagated rejects (production hosts wiring `handleError` to Sentry / alerting stay noise-free). Flag both so reviewers can sanity-check against any routines that depended on the implicit reject-→-error coercion.

## Acceptance Criteria

- `new UserError('m', { isReject: true }).isReject === true`; default is `false`.
- `controlReject` constructs its `UserError` with `isReject: true`.
- `runRoutine` returns `{ status: 'reject', error }` when its catch sees an `isReject` error, and `{ status: 'error', error }` otherwise.
- `runRoutine`'s catch does **not** call `context.handleError` for an `isReject` error — rejects bypass `handleError` entirely, matching the line-49 routine-loop early-return semantics.
- Existing Lowdefy tests still pass.
- New unit tests cover the three behaviours above.
- PR description explains the cross-routine semantic shift and asks reviewers to sanity-check.

## Files

In `/Users/sam/Developer/lowdefy/lowdefy`:

- `packages/utils/errors/src/UserError.js` — modify (add `isReject` constructor option + field).
- `packages/api/src/routes/endpoints/control/controlReject.js` — modify (pass `isReject: true` on line 40).
- `packages/api/src/routes/endpoints/runRoutine.js` — modify (rewrite catch on lines 56-62 to branch on `error.isReject` before `context.handleError`).
- Plus test files for each (whatever pattern the repo uses).

## Notes

- Do not change `callApi`'s signature. The contract is unchanged: `callApi` still throws on `:reject` / `:throw` and returns raw response on success; the only thing changing is what the *wrapping* `runRoutine` does with a caught throw.
- Part 29 in the workflows-module repo does not ship until this PR merges.
