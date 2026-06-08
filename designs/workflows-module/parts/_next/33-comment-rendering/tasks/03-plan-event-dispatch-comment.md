# Task 3: `planEventDispatch` takes `comment` and folds it after render

## Context

Tasks 1–2 established the pieces: `foldCommentIntoEvent(eventPayload, comment, appName)` (pure helper in `shared/phases/planners/`) and a `mergeEventOverrides` that deep-merges `display` under the app key. This task wires them into the shared event-dispatch planner — `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — which composes the full event doc for every handler type (`StartWorkflow` / `SubmitWorkflowAction` / `CancelWorkflow` / `CloseWorkflow` / `tracker-mirror`; Part 24 later adds `UpdateActionFields`).

The planner's current sequence (Submit path): build engine-default payload → `mergeEventOverrides` (YAML + pre-hook layers) → `renderEventDisplay` (compiles **every string** in the display tree as a Nunjucks template against the render context) → assemble `doc`.

The fold's position is load-bearing (design D4): **merge → render → fold**. Folding before render would push raw user-typed HTML through the Nunjucks compile — a comment containing `{{`/`{%` would throw (failing the submit) or interpolate against a context carrying the full `user`/`action`/`workflow` docs (a data-exposure path). Folding last is also what gives the precedence rule: a runtime comment wins the description slot over an author static `display.{app}.description`, while the (deep-merged, rendered) title survives.

Having the fold inside this planner — not in any handler — is the contract to Part 24: when it adds its `UpdateActionFields` handler type and passes `comment`, the fold covers it with zero extra calls.

## Task

Amend `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`:

1. **New `comment` parameter** on the destructured signature, defaulting to `null`. Contract (design D5): the TipTap rich-text value `{ html, text, markdown?, fileList? } | null`; the planner only ever reads `comment.html` (via the helper). Add the `@param` JSDoc line.
2. **Call the fold after render**, unconditionally for all handler types (it no-ops on null/empty): after `renderEventDisplay` produces `renderedDisplay` and before/around assembling `doc`, apply `foldCommentIntoEvent` so the final `doc.display[appName].description` carries `comment.html` when present. The helper takes an `eventPayload` carrying `display` — e.g. fold on `{ ...mergedPayload, display: renderedDisplay }` or on the assembled `doc` just before return; pick the minimal shape, but the fold must see the **rendered** display.
3. **Docblock update.** Replace the stale paragraph ("No `metadata.comment` is written — … Part 38 keeps the `comment` param flowing on the emitted payload via task 19; the planner doesn't touch it") with the live contract: the runtime comment is folded into `display.{app_name}.description` by `foldCommentIntoEvent`, **after** `renderEventDisplay` (merge → render → fold, Part 33 D4) — comment HTML is stored verbatim and never templated; a runtime comment wins the description slot over an author static override; no `metadata.comment` is ever written. Also update the `buildMetadata` doc note if it reads oddly ("superseded by" → "comment lives in `display.{app}.description` via `foldCommentIntoEvent`").
4. Import `foldCommentIntoEvent` from `./foldCommentIntoEvent.js`.

Amend `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.test.js` — add cases (reuse the existing Submit fixtures):

- **Coexistence (D7):** Submit with a YAML override `display: { {app}: { description: 'Static desc' } }` and **no** comment → doc carries the rendered engine title *and* the static description under the one app key (proves the deep-merge end-to-end through the planner).
- **Comment wins (D4):** same YAML static description *plus* `comment: { html: '<p>Typed</p>', text: 'Typed' }` → `doc.display[app].description === '<p>Typed</p>'`; the rendered engine title is untouched.
- **No comment → static survives:** already half-covered by the coexistence case; assert the static description string verbatim.
- **No `metadata.comment`:** Submit with a comment → `doc.metadata.comment` is `undefined` (design Verification: no `metadata.comment` assertions remain — this is the replacement assertion).
- **Template passthrough through the full planner:** `comment.html` containing `{{ user.profile.name }}` and a stray `{%` → stored verbatim in `doc.display[app].description` while the engine title in the same bucket *is* rendered; no throw.
- **Lifecycle unaffected:** a `StartWorkflow` call without `comment` produces the same doc as before (no description key appears).

## Acceptance Criteria

- `planEventDispatch` accepts `comment` and the fold runs strictly after `renderEventDisplay` (verify by the template-passthrough test — pre-render folding would throw on the stray `{%`).
- All six new test cases pass; the existing suite stays green: `pnpm test planEventDispatch` from the repo root.
- `grep -n "metadata.comment" plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` matches only (at most) the docblock's "no metadata.comment is ever written" statement — no code writes it.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — modify — `comment` param, post-render fold call, docblock rewrite.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.test.js` — modify — six new cases above.

## Notes

- The fold call is **unconditional** (not gated on `isSubmit`): the helper no-ops without a comment, and this is what lets Part 24's future `UpdateActionFields` handler type pick up comment rendering automatically. Lifecycle callers simply never pass `comment`.
- Do not add an `UpdateActionFields` handler type here — that's Part 24's change; the planner's handler enum still throws on unknown types.
- `mergeEventOverrides` applies only on the Submit path (existing behaviour) — leave that as-is; the fold applies to the rendered display regardless of path.
