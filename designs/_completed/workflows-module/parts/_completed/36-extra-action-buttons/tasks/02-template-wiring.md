# Task 2: Wire `buttons.extra` into the four verb templates' `floating-actions` bars

## Context

Part 36 lets authors add buttons to the workflows `floating-actions` bar via `pages.{verb}.buttons.extra:`. Each verb template (`edit`, `view`, `review`, `error`) renders the bar by passing a static `actions:` array to the layout module's `floating-actions` component. This task makes the template concatenate the authored `buttons.extra` entries onto that array.

The per-verb chrome (`action.pages?.[verb]`) is already forwarded to each template as the top-level `page_config` var by `makeActionPages.js` (line 97-100) — it spreads `action.pages?.[verb]` wholesale, so `page_config.buttons.extra` rides along automatically with **no resolver change needed**. The templates already read sibling values like `page_config.buttons.submit.visible`, `page_config.requests`, `page_config.formFooter`.

The wrapping idiom already exists in these templates — e.g. `view.yaml.njk:34-43` wraps `requests:`:

```yaml
requests:
  _build.array.concat:
    - - _ref: requests/get_workflow_action.yaml
        ...
    - _var:
        key: page_config.requests
        default: []
```

Apply the **same shape** to the `floating-actions` `actions:` array.

## Task

In each of the four templates, locate the `_ref: layout/floating-actions` block's `vars.actions:` array and wrap it in `_build.array.concat:` so that the existing static button list becomes the first concat element (a nested list) and the authored extras are appended as the trailing element:

```yaml
actions:
  _build.array.concat:
    - - id: button_<existing_first>
        ...            # the existing static button blocks, unchanged, as one nested list
      - id: button_<existing_second>
        ...
    - _var:
        key: page_config.buttons.extra
        default: []
```

Authored extras render **after** the signal buttons (the design's "append" decision): given `direction: row-reverse` on the bar, signal buttons stay rightmost (primary position) and extras land to their left.

Per template (the existing buttons are unchanged — only the surrounding `actions:` key gets the concat wrapper):

- **`modules/workflows/templates/edit.yaml.njk`** — `actions:` near line 238. Existing buttons: `button_not_required`, `button_progress`, `button_submit`. Leave the confirm-modal blocks below (the `page_config.buttons.{name}.modal` section, ~line 426+) untouched — they are outside the `actions:` array.
- **`modules/workflows/templates/view.yaml.njk`** — `actions:` near line 177. Existing buttons: `button_request_changes`, `button_edit`. Leave the `request_changes_modal` block (~line 240) untouched.
- **`modules/workflows/templates/review.yaml.njk`** — `actions:` near line 223. Existing buttons: `button_edit`, `button_request_changes`, `button_approve`. Leave the modal blocks untouched.
- **`modules/workflows/templates/error.yaml.njk`** — `actions:` near line 255. Existing button: `button_resolve_error` (single entry — still wrap it as a one-element nested list). Leave the ConfirmModal block untouched.

No change to existing button definitions, their `visible`/`disabled` gates, or the confirm-modal blocks. No new modal-slot wiring — author modals go in `pages.{verb}.formFooter` and are picked up by the existing footer slot.

## Acceptance Criteria

- All four templates wrap their `floating-actions` `actions:` array in `_build.array.concat:` with `page_config.buttons.extra` (default `[]`) appended as the trailing element.
- The existing signal/nav buttons remain byte-for-byte identical apart from their new indentation under the concat's first nested-list element.
- `pnpm ldf:b` from `apps/demo` (or `pnpm --filter @lowdefy/modules-demo ldf:b` from root) compiles cleanly. (At this point the demo has no `buttons.extra` yet — Task 3 adds it — so a clean build with an empty default array is the bar.)
- A round-trip unit case in `makeActionPages.test.js` (below) passes.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — wrap `actions:` in `_build.array.concat`, append `page_config.buttons.extra`.
- `modules/workflows/templates/view.yaml.njk` — modify — same.
- `modules/workflows/templates/review.yaml.njk` — modify — same.
- `modules/workflows/templates/error.yaml.njk` — modify — same.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — add the round-trip case below.

## Round-trip test case (per design Verification)

In `makeActionPages.test.js`, add a fixture form action with `pages.edit.buttons.extra` set to an author array (e.g. `[{ id: "open_help", title: "Help", events: { onClick: [{ id: "nav", type: "Link", params: { url: "https://x" } }] } }]`) and an `access` map that emits the edit page. Assert the emitted edit page's `_ref.vars.page_config.buttons.extra` deep-equals the author's array.

This confirms the resolver forwards the slot verbatim. The `_build.array.concat` that materialises the merged `actions:` array happens later inside Lowdefy's build-time YAML processing, so the resolver-level test can only assert the round-trip — the merged-list behaviour is covered by the `ldf:b` build check above.

## Notes

- Mind YAML indentation: the existing button list is a sequence of mapping blocks; under `_build.array.concat:` it becomes the first item (`- -` opens a nested list), so every existing button line indents two spaces deeper. Verify with `ldf:b`.
- After Part 56 the `floating-actions` block is page-level chrome sitting outside the three-tier shell's columns, but the block and this wrapping target are structurally unchanged — this part rebases the concat onto the post-56 form templates.
