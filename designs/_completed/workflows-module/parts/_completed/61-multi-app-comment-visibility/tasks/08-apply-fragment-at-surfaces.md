# Task 8: Drop the fragment at every comment site, map `comment_visibility`, reset toggle on close

## Context

Task 7 created the shared comment-input + visibility-control fragment (`components/fields/comment_input.yaml`). Task 5 made both endpoints map `comment_visibility` from the request payload. This task replaces every inline comment `TiptapInput` with the fragment, posts `comment_visibility` from each comment's payload, and resets the visibility toggle wherever the comment is reset on modal close.

**Text-only supersedes Part 62's inline edits (D6).** The fragment is text-only (task 7) — Image extension off, no `s3PostPolicyRequestId`, and `tiptap_input.yaml`'s text-only `required` validation (`<key>.text` non-empty, no `fileList` clause). [Part 62](designs/workflows-module/parts/_completed/62-changes-requested-callout/design.md) lands first and applies this directly to the four **request-changes** inputs (its task 4); swapping every comment input — request-changes _and_ the optional/edit/error/universal-fields comments — to this fragment generalises text-only to all of them and **replaces** those inline edits. Concretely, when you swap each input: drop any existing inline `properties.image` block and `s3PostPolicyRequestId` (the fragment owns them now), and drop each input's bespoke `validate` (including the `_or`/`fileList` clause on the request-changes inputs) in favour of the fragment's `required`-driven text-only validation. The end state is one fragment, text-only everywhere, no per-input validate.

The comment-input sites (design, Files-changed → Comment surfaces):

- **`components/check-action-surface.yaml`** — the optional surface comment (`current_action.comment`, ~`:270`) and the Request Changes modal comment (`current_action.change_request_comment`, ~`:630`). Each posts `comment: { _state: <path> }` in its CallAPI payload (surface: signal button bar ~`:369`–`:576`; modal: `submit_request_changes` onOk ~`:619`), and resets the comment to `null` on `onClose` (~`:628`).
- **`components/check-action-modal.yaml`** — covered **transitively** (it wraps `check-action-surface.yaml`'s comment paths). No separate control here — confirm no inline comment input exists that bypasses the surface.
- **`templates/action.yaml.njk`** — surface comment + Request Changes modal comment.
- **`templates/view.yaml.njk`** — the Request Changes modal's `change_request_comment`.
- **`templates/error.yaml.njk`** — the recovery comment and the Request Changes comment.
- **`templates/review.yaml.njk`** — the Request Changes modal's `change_request_comment` (~`:476`) and the surface comment; resets on `onClose` (~`:161`–`:162`, `:474`); posts `comment` (~`:397`, `:468`–`:469`, `:546`).
- **`templates/edit.yaml.njk`** — the regular form-submit comment.
- **`components/universal-fields/universal-fields.yaml`** — the **Part 24** update-fields comment (the `update_fields` CallAPI payload, ~`:146`–`:152`, currently `comment: null`).

For each site, three coordinated changes:

1. **Input** — replace the inline `TiptapInput` with a `_ref` to `comment_input.yaml`, passing the site's `key` (existing comment state path), `toggle_key`, `title`, `placeholder`, `visible` gate, and `required` (the Request Changes comments are `required: true` with their existing validation).
2. **Payload** — beside each existing `comment: { _state: <path> }`, add `comment_visibility` mapping the toggle state to the string enum:

   ```yaml
   comment_visibility:
     _if:
       - { _state: <toggle_key> } # on = internal
       - "internal"
       - "shared"
   ```

3. **Reset** — wherever the surface resets the comment to `null` on `onClose`, also reset the toggle to `false` (so a reopened modal starts at `shared`).

## Task

For **every** site listed above:

- Swap the inline comment `TiptapInput` for the shared fragment `_ref` (parameterised per task 7).
- Add the `comment_visibility` payload mapping (the `_if` boolean→enum form above) beside the existing `comment` payload key in that site's submit/request-changes/update-fields CallAPI.
- Add the toggle reset (`<toggle_key>: false`) alongside the existing comment-`null` reset on `onClose`.

For **`components/universal-fields/universal-fields.yaml`** specifically: the `update_fields` payload currently sends `comment: null`. Add `comment_visibility` there too so the Part 24 endpoint (which now accepts the key via task 5) receives a value — without this the endpoint would accept the key but never be sent one (design, Files-changed note on universal-fields). Use the same boolean→enum `_if` mapping driven by the fragment's toggle (or, if this surface has no comment input wired, send `comment_visibility: "shared"` to match the `comment: null` baseline — confirm against the surface's actual comment wiring).

For **`components/check-action-modal.yaml`**: verify it has no inline comment input of its own (it wraps the surface). If it only wraps `check-action-surface.yaml`, no change is needed here — note that in the implementation.

## Acceptance Criteria

- Every comment `TiptapInput` across the listed surfaces is rendered via the single `comment_input.yaml` fragment — no inline `TiptapInput` comment blocks remain duplicated across surfaces.
- Every comment input is text-only (D6): no inline `properties.image`/`s3PostPolicyRequestId` survives on any comment block, and no per-input `validate` survives (the request-changes inputs' `_or`/`fileList` validate is replaced by the fragment's text-only `required` validation). This supersedes Part 62 task 4's inline text-only edits on the request-changes inputs.
- Every CallAPI payload that posts `comment` also posts `comment_visibility` as `"shared" | "internal"` derived from the toggle (`shared` when the toggle is off/absent).
- The Part 24 `update_fields` payload posts `comment_visibility` (so the endpoint receives a value).
- Every `onClose` that resets the comment to `null` also resets the visibility toggle to `false`.
- With `enable_internal_comments` unset (demo default): the Switch is absent everywhere, and every comment posts `comment_visibility: "shared"`.
- `pnpm ldf:b` (from `apps/demo`) compiles all affected pages.
- Spot-check a check-action page and the universal-fields modal in a dev build: the comment input renders; with the var off the toggle is hidden.

## Files

- `modules/workflows/components/check-action-surface.yaml` — modify — surface comment + Request Changes modal comment: fragment swap, `comment_visibility` payloads, toggle reset on close.
- `modules/workflows/templates/action.yaml.njk` — modify — surface comment + Request Changes modal comment.
- `modules/workflows/templates/view.yaml.njk` — modify — Request Changes modal comment.
- `modules/workflows/templates/error.yaml.njk` — modify — recovery comment + Request Changes comment.
- `modules/workflows/templates/review.yaml.njk` — modify — surface comment + Request Changes modal comment.
- `modules/workflows/templates/edit.yaml.njk` — modify — form-submit comment.
- `modules/workflows/components/universal-fields/universal-fields.yaml` — modify — `update_fields` payload posts `comment_visibility` (+ fragment swap if it carries a comment input).
- `modules/workflows/components/check-action-modal.yaml` — verify only (transitive coverage; no change expected).

## Notes

- The toggle state path (`toggle_key`) must be distinct per comment path so the surface comment and the Request Changes comment don't share a toggle. Mirror the existing comment-path naming (e.g. `current_action.comment` → `current_action.comment_internal`; `current_action.change_request_comment` → `current_action.change_request_comment_internal`).
- Audit state refs when touching input ids (CLAUDE.md "Audit state refs when changing input blocks") — the comment paths themselves (`current_action.comment`, `change_request_comment`, the edit/review comment paths) must stay identical so the existing `comment` payloads and resets keep working; only the _new_ toggle path is added.
- This is purely additive on the read side — `GetEventsTimeline`, `events-timeline.yaml`, the `EventsTimeline` block, and the Part 56 changes-requested callout are explicitly unchanged (design, Read side).
