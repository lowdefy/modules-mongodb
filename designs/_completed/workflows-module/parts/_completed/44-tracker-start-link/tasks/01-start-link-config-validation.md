# Task 1: Validate `tracker.start_link` shape in `makeWorkflowsConfig`

## Context

Part 44 adds an optional `start_link:` field to the `tracker:` block of `kind: tracker` actions — an author-declared link to the page where the child workflow's entity gets created:

```yaml
tracker:
  workflow_type: device-installation
  start_link:
    pageId: ticket-new # app page id, used verbatim
    urlQuery:
      action_id: true # sentinel → tracker action _id (the parent_action_id)
      entity_id: true # sentinel → parent entity _id
      source: onboarding # static params pass through verbatim
```

`modules/workflows/resolvers/makeWorkflowsConfig.js` is the config validator and the schema source of truth. Its `validateAction` (line 274) currently checks only that `kind: tracker` carries a `tracker:` block; the block's contents are unvalidated. The `tracker` field already flows through to the normalized output via `ACTION_FIELDS` (line 7), so no pick change is needed — only validation.

Validation matters here because a malformed `start_link` would otherwise fail silently downstream: a `true` on a non-sentinel key or a non-string static (`count: 3`) would ship the literal value into a URL.

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`, add a validation function (e.g. `validateTrackerStartLink(workflow, action)`) called from `validateAction` alongside the existing kind checks, enforcing design proposed change 5:

1. **Applicability** — only runs when `action.tracker?.start_link` is present (`start_link` is optional; a `tracker:` block with only `workflow_type` stays valid).
2. **Shape** — `start_link` must be a plain object (not null, not an array). Allowed keys are exactly `pageId` and `urlQuery`; any other key hard-errors via the existing `fail(workflow.type, ...)` helper. The error message for unknown keys should make the rejection of `title:` discoverable — `title` is familiar from custom-kind cell links but is not part of the engine-link shape (e.g. mention that only `pageId` / `urlQuery` are allowed).
3. **`pageId`** — required, must be a non-empty string.
4. **`urlQuery`** — optional; if present must be a plain object. The two reserved keys `action_id` and `entity_id` are **sentinel-only**: if present, their value must be exactly `true`. Every other key must carry a string (static param, passes through verbatim).

   Everything else hard-errors: a static string on a reserved key (a stale `action_id: 'literal'` would silently hand the wrong `parent_action_id` to `start-workflow`, cross-linking the child onto the wrong tracker), `true` on any non-reserved key (would silently ship the literal `true` into a URL), and non-string statics (`3`, `false`, `null`, objects, arrays) for the same reason.

Follow the existing validator idioms: `fail()` with messages of the form `` `${where} tracker.start_link ...` `` including the offending value via `JSON.stringify` where helpful (see `validateActionAccess` / `validateStatusMapCells` for tone and structure).

Add test cases to `modules/workflows/resolvers/makeWorkflowsConfig.test.js`, following the existing `validateActionAccess:` / `validateStatusMapCells:` test naming style. Cover at least:

- Valid: full shape (`pageId` + `urlQuery` with both sentinels and a static string) passes and flows through to the normalized output's `actions[].tracker`.
- Valid: minimal shape (`pageId` only, no `urlQuery`) passes.
- Valid: tracker block with no `start_link` at all still passes (regression guard).
- Reject: missing `pageId` / non-string `pageId` / empty-string `pageId`.
- Reject: unknown key — specifically `title:`.
- Reject: `start_link` that is not an object (string, array).
- Reject: `urlQuery` that is not an object.
- Reject: `urlQuery` with `true` on a non-sentinel key (e.g. `source: true`).
- Reject: `urlQuery` with a static string on a reserved key (e.g. `action_id: 'some-id'`; cover `entity_id: 'foo'` too).
- Reject: `urlQuery` with a non-string static (e.g. `count: 3`, `flag: false`).

## Acceptance Criteria

- All rejection cases throw `makeWorkflowsConfig: workflow "..."` errors naming the action and the offending field.
- A valid `start_link` survives into the normalized config output unchanged.
- `pnpm test modules/workflows/resolvers/makeWorkflowsConfig.test.js` passes (run from repo root: `npx jest modules/workflows/resolvers/makeWorkflowsConfig.test.js`).
- No change to `ACTION_FIELDS` / `WORKFLOW_FIELDS` (the `tracker` field already flows through).

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `validateTrackerStartLink` and call it from `validateAction`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add the validation test cases.

## Notes

- The existing kind checks already guarantee `start_link` can only appear under a tracker block on a `kind: tracker` action (`kind: simple` rejects a `tracker:` block; `form` + `tracker` together rejected), so the new function does not need its own kind guard beyond reading `action.tracker?.start_link`.
- Do **not** add validation for `tracker.workflow_type` or other tracker-block keys — out of this part's scope (design covers `start_link` only).
