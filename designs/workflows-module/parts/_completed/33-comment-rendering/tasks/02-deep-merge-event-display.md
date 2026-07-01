# Task 2: Deep-merge event `display` under the app key, and strip non-comment `description`

## Context

Event `display` is app-keyed — `display.{app}.{title,description,info}` — so one event document feeds multiple apps' timelines (each keyed by its `display_key`). The engine writes a generic default title for the submitting app (`planEventDispatch.js` builds `{ [appName]: { title } }`), and workflow authors override **per app** via `event.{interaction}.display.{app}.title` — **title only**; `description` is reserved for the runtime comment (design D4) and rejected by the builder validation (task 8). A pre-hook `event_overrides` return can also carry a `display`.

Today's merge in `plugins/modules-mongodb-plugins/src/connections/shared/mergeEventOverrides.js` is **one level deep** at `display` (`{ ...base.display, ...override.display }`) — an app-keyed override replaces the _whole app bucket_ and silently drops the engine title. For the engine title + an author per-app title override + (task 3's) comment to coexist within one app bucket — and so an override targeting one app's `title` doesn't drop sibling engine-written keys — the merge must go two levels: `display → {app} → {title,description}` (design D7).

Because the description slot is **comment-only** (D4), this task also makes the merge the place that guarantees it: after deep-merging, any `description` on a merged app bucket (e.g. one returned by a pre-hook) is **stripped**, so the only writer of `display.{app}.description` is `foldCommentIntoEvent`, which runs after this merge and after render (task 3). Authored descriptions never reach here — the builder rejects them (task 8) — so the strip is the runtime backstop for pre-hook returns.

Part 38 already shipped the shared deep-merge rule as `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/deepMerge.js` ("shared by every planner that layers a patch onto loaded state": plain objects deep-merge, arrays/scalars/null replace whole, absent keys keep base). Per "one correct way", this task reuses it on the `display` channel — no bespoke second merge.

The file's docblock is also stale twice over: it still documents the pre-rebuild world ("metadata.comment already folded into layer 1 … Do NOT re-inject `comment` here" — `buildDefaultLogEventPayload` no longer exists, and Part 33 drops `metadata.comment` entirely). Its test file carries two `metadata.comment` cases that assert the dead contract.

## Task

Amend `plugins/modules-mongodb-plugins/src/connections/shared/mergeEventOverrides.js`:

1. Import `deepMerge` from `./phases/planners/deepMerge.js`.
2. In the `overlay` function, merge the `display` channel with `deepMerge(base.display, override.display)` when `override.display` is defined (keep the `undefined → base` short-circuit). Leave `references` and `metadata` on the existing one-level `overlayObject`, and `type` on last-non-empty-wins — the design only deepens `display`.
3. After the display merge, **strip `description`** from every app bucket of the merged `display` (delete the key where present), so the post-render comment fold is the sole writer of that slot (design D4). Keep this confined to `description` — `title` and any other keys pass through.
4. Rewrite the docblock. It should state:
   - Layer order: engine default payload (from `planEventDispatch`) → YAML `event_overrides[signal]` → pre-hook `event_overrides` return; later layers win per field.
   - `display` deep-merges under the app key (two levels: `display → {app} → {title,…}`) via the shared `deepMerge` rule, so an author per-app **title** override coexists with the engine default title (design Part 33 D7).
   - `description` is **comment-only**: stripped from the merged display here; written only by `foldCommentIntoEvent` after render (point there). Authored descriptions are rejected at build (task 8).
   - `references` / `metadata` merge one level deep; `type` — last non-empty string wins.
   - Remove all `metadata.comment` / "Do NOT re-inject comment" / `buildDefaultLogEventPayload` prose.

Amend `plugins/modules-mongodb-plugins/src/connections/shared/mergeEventOverrides.test.js`:

5. **Remove** the two `metadata.comment` tests (`"YAML override on metadata.foo does NOT clobber default metadata.comment …"` and `"pre-hook override on metadata.comment overrides layer-1 runtime comment"`) — they assert the dead pre-Part-38 contract. Their `display`-channel replacements land here and in task 3 (no `metadata.comment` assertions remain anywhere after this part — design Verification § Test migration).
6. **Replace** the `"pre-hook override on display.{appName} replaces just that key (one-level deep)"` test with deep-merge + strip assertions:
   - an override carrying `display: { team: { title: 'Custom' } }` over a base `display: { team: { title: 'Engine title' } }` yields `team.title === 'Custom'` (author title wins) and does not drop sibling keys in the bucket;
   - an override under a _different_ app key (`display: { portal: { title: 'Generic' } }`) adds the `portal` bucket while keeping the engine `team` bucket intact;
   - an override carrying `display: { team: { description: 'Custom' } }` (a pre-hook return) yields **no** `description` on `team` after the merge — it is stripped (comment-only, D4).
7. Keep/extend the remaining cases (no-override passthrough, type replacement, empty-string type, YAML+pre-hook collision, references add-key) — they still hold; update fixtures only if they relied on the removed `metadata.comment` seed.

## Acceptance Criteria

- `mergeEventOverrides` deep-merges `display` via the shared `deepMerge` helper — no inline recursive merge logic in this file.
- Engine title + author per-app `title` override coexist in one app bucket (test 6a passes); a different-app override adds its bucket without dropping the engine bucket (test 6b).
- A `description` arriving on the merged display is stripped (test 6c) — only the fold writes it.
- `grep -rn "metadata.comment" plugins/modules-mongodb-plugins/src/` returns no test assertions and no docblock prose in `mergeEventOverrides.{js,test.js}` (the `planEventDispatch.js` docblock note is task 3's to update).
- `pnpm test mergeEventOverrides` passes from the repo root.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/mergeEventOverrides.js` — modify — `display` channel through `deepMerge`; strip `description` from each app bucket; rewrite stale docblock.
- `plugins/modules-mongodb-plugins/src/connections/shared/mergeEventOverrides.test.js` — modify — drop two `metadata.comment` cases; replace the one-level-deep display case with deep-merge + description-strip cases.

## Notes

- `deepMerge` lives under `shared/phases/planners/`; `mergeEventOverrides.js` is in `shared/` — the relative import is `./phases/planners/deepMerge.js`.
- Don't change `planEventDispatch.js` here — its call into `mergeEventOverrides` is shape-compatible with this change; the planner-side tests for coexistence land in task 3.
- `deepMerge`'s "arrays replace whole / null replaces" semantics are wanted: a pre-hook can still explicitly null out a field.
- The description-strip is the runtime backstop; the build-time reject of authored descriptions is task 8 (`makeWorkflowsConfig`).
