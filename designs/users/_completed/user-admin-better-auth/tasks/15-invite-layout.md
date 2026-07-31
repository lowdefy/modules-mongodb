# Task 15: `invite` screen — pipeline phase 2 (layout)

## Context

Second phase for the `invite` page. Mechanically translate the frame (task 14)
into a Lowdefy block tree — copy numbers and ids, do not redesign.

**Invoke the skill/phase:** `mock-to-lowdefy` phase `phases/02-layout.md`, with
`references/lowdefy-layout.md` + `references/lowdefy-blocks.md`. Use `lowdefy-docs`
MCP (or `/lowdefy-config`) to verify the state-switch container props (the
resolution slot shows one layer at a time — model with `when:`/state, not a
tab/modal unless the schema fits) and the confirm Modal.

**Frame:** `designs/user-admin-better-auth/mockups/frames/invite.html`
**Target source:** `modules/user-admin/pages/invite.yaml` (+ `components/*.yaml`)

## Task

Follow `phases/02-layout.md`. Shared-component discovery: `layout` `page` shell,
shared `title-block`, shared `card`, the `MultipleSelector` block for roles.
Translate to a block tree — sizeless containers, `Html` placeholder slots per leaf
carrying frame ids. The email-entry card, the resolution slot with one structural
container per outcome layer (resting / checking / unknown-form / existing-form /
member / pending), and the cancel confirm modal container.

## Acceptance Criteria

- `modules/user-admin/pages/invite.yaml` (+ `components/*.yaml`) hold the
  structural tree: sizeless containers, placeholder slots, ids from the frame.
- Shared `page`/`title-block`/`card` reused; one container per resolution layer;
  cancel confirm modal present.
- `pnpm ldf:b` compiles.

## Files

- `modules/user-admin/pages/invite.yaml` — replace stub with structural layout
- `modules/user-admin/components/*.yaml` — resolution layers + modal as needed

## Notes

- No content/requests yet (phase 3 is task 16). The state machine that shows one
  layer at a time is filled in content/wire.
