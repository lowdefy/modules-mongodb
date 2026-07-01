# Task 7: Extract the single shared "comment input + visibility control" fragment

## Context

Part 61 adds a shared/internal control beside **every** comment `TiptapInput` across the workflow surfaces. To avoid drift across the seven-plus comment sites (the "one correct way" principle), the control must live in **one** shared fragment that every surface `_ref`s — not be copied into each surface (design, Files-changed → Comment surfaces).

The comment-input sites today are inline `TiptapInput` blocks. Representative example from `components/check-action-surface.yaml`:

```yaml
- id: current_action.comment
  type: TiptapInput
  visible: { ...mode gate... }
  properties:
    title: Comment
    placeholder: Add a comment (optional).
```

and the Request Changes modal's `current_action.change_request_comment` (a `required` TiptapInput with validation). Sites vary in: state-path id, title/placeholder, `required` + validation, and `visible` gate.

The control is a `Switch`, default **off = `shared`** (on = `internal`), shown **only** when the connection's app has `enable_internal_comments` set. Page config can read this at **build time** via `_module.var: enable_internal_comments` (set in task 6). The switch writes a boolean toggle state; the payload mapping to the `"shared" | "internal"` string enum happens at payload time (task 8), so this fragment only needs to render the input + the gated toggle and own the toggle's state path.

There is already a `components/fields/tiptap_input.yaml` fragment that wraps `TiptapInput` with `_var`-parameterised `key`, `title`, `placeholder`, `visible`, `required`, `label_*`, `s3PostPolicyRequestId`. Reuse it inside the new fragment rather than re-declaring `TiptapInput`.

**Text-only (design D6).** Every comment is text-only — inline images are disabled on all comment inputs (`properties.image.disabled: true`, `s3PostPolicyRequestId` unset), so `comment.fileList` is always empty and the callout in [Part 62](designs/workflows-module/parts/_completed/62-changes-requested-callout/design.md) never has to render an attachment. This is the generalisation of Part 62's request-changes-only text-only change to **every** comment surface, and it is why a single branch-free fragment is possible (no per-site `allow_images` var). Two consequences for this task:

- `tiptap_input.yaml` today enables uploads (its `s3PostPolicyRequestId` defaults to `upload_files`) and does not disable the Image extension. To express text-only through it, add a `disable_files` (boolean, default `false`) var to `tiptap_input.yaml` that, when `true`, sets `properties.image.disabled: true` and **omits** `s3PostPolicyRequestId` entirely. Default `false` preserves the existing upload behaviour for the form-field callers that use `tiptap_input.yaml` directly. The comment fragment passes `disable_files: true`.
- `tiptap_input.yaml`'s `required` validation already checks **only** `<key>.text` non-empty (no `fileList` clause), so a comment input that uses that validation gets the simplified, text-only validate for free — no bespoke validate needed in the comment fragment.

## Task

Create a new shared fragment — e.g. `modules/workflows/components/fields/comment_input.yaml` — that renders, as a unit:

1. **The comment `TiptapInput`** — delegate to the existing `components/fields/tiptap_input.yaml` via `_ref`, passing through the parameters each site needs:
   - `key` (the comment state path / input id, e.g. `current_action.comment`).
   - `title`, `placeholder`.
   - `visible` (the site's mode gate — passed in by the caller).
   - `required` (drive the standard "comment required" validation already present in `tiptap_input.yaml`, which checks `<key>.text` non-empty only — no `fileList` clause).
   - `disable_files: true` (always — text-only, D6), so the Image extension is off and no `s3PostPolicyRequestId` is set on any comment input.

2. **The shared/internal `Switch`** — shown only when `enable_internal_comments` is set:
   - Gate its presence at **build time** with `_module.var: enable_internal_comments` (use `_build.if` / build-time gating so the block is absent entirely when the var is false — not merely `visible: false`).
   - `id` = a toggle state path derived from the comment key (e.g. `<key>_internal`), passed in or derived via a `_var`.
   - Default **off** (= shared). Label it clearly (e.g. "Internal — visible only to this app").

Parameterise the fragment with `vars`:

- `key` (required) — the comment state path / TiptapInput id.
- `toggle_key` (required, or derived from `key`) — the visibility toggle state path.
- `title`, `placeholder` (optional).
- `visible` (optional) — the caller's mode gate, forwarded to the input.
- `required` (optional, default false) — drives the input's required validation.

Use `.yaml` with `_var` (operator positions) unless string interpolation into ids is needed, in which case use `.yaml.njk` (per the repo "Modular component extraction" rule). Deriving `toggle_key` by string-concat in an `id` position needs `.yaml.njk`; passing `toggle_key` explicitly as a var keeps it `.yaml`. Prefer passing `toggle_key` explicitly to stay in plain `.yaml`.

## Acceptance Criteria

- A single new fragment file renders the comment input + the gated visibility Switch as one `_ref`-able unit.
- When `enable_internal_comments` is **false/unset**, the Switch block is **absent** from the built config (build-time gate, not runtime `visible`).
- When `enable_internal_comments` is **true**, the Switch renders, defaults off (= shared), and writes its boolean to the `toggle_key` state path.
- The fragment reuses `components/fields/tiptap_input.yaml` for the `TiptapInput` rather than re-declaring it.
- The fragment is **text-only** (D6): it passes `disable_files: true` so the rendered input has `properties.image.disabled: true` and no `s3PostPolicyRequestId`. `tiptap_input.yaml` gains a `disable_files` var (default `false`) that drives this; the default preserves uploads for its existing form-field callers.
- The fragment is parameterised by state path(s), title, placeholder, visible gate, and required — covering the variation across the call sites.
- `pnpm ldf:b` (from `apps/demo`) compiles a page that `_ref`s the fragment (verified in task 8).

## Files

- `modules/workflows/components/fields/comment_input.yaml` (or `.yaml.njk`) — create — the shared comment-input + visibility-control fragment.
- `modules/workflows/components/fields/tiptap_input.yaml` — modify — add a `disable_files` var (default `false`) that, when `true`, sets `properties.image.disabled: true` and omits `s3PostPolicyRequestId` (text-only mode, D6).

## Notes

- Do **not** put the `comment_visibility` payload mapping inside this fragment — payloads are constructed at the button/modal level (task 8). This fragment owns the _input + toggle state_; the payload sites read the toggle state and map it to the string enum.
- The build-time gate is the crux of design D2: a single-app/customer deployment leaves `enable_internal_comments` off and gets zero UI — the Switch must not render at all, and every comment defaults to `shared`.
