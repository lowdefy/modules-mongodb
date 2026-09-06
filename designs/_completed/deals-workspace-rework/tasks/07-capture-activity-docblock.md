# Task 7: Correct `capture_activity`'s stale `prefill` docblock

## Context

`modules/activities/components/capture_activity.yaml` is a self-contained button-plus-modal for
creating an activity from anywhere. Consumers pass a `prefill` object to seed the form when the modal
opens.

Its header docblock documents `prefill` as:

```
#   prefill       — { type, title, description, contacts, company_ids }
```

**That list is incomplete.** The implementation has always also supported `prefill.attributes` and
`prefill.references` — see the `seed_prefill` `SetState` in the modal's `onOpen`, which merges
`prefill.attributes` over the module's own defaults via `_object.assign` with the consumer's values
winning (its inline comment says "let any consumer-prefilled attributes win"), and seeds
`prefill.references` alongside.

This is not a cosmetic fix. The stale docblock caused a design to propose adding a capability that
already existed, and to record a false cross-module dependency, because the comment was read instead
of the code. It is worth correcting for exactly that reason.

There is a real limitation to capture at the same time: `attributes` and `references` are seeded in
the modal's **`onOpen`**, so they apply in `mode: modal` only. In `mode: page` the button builds a
`urlQuery` carrying just `type`, `title`, `contacts` and `company_ids` — a consumer switching to page
mode silently loses attribute prefill.

## Task

Update the `prefill` line in the docblock of `modules/activities/components/capture_activity.yaml` to:

- list all supported keys: `type`, `title`, `description`, `contacts`, `company_ids`, `attributes`,
  `references`;
- state that `attributes` is merged **over** the module's seeded defaults (today: `date`, `duration`,
  `direction`), with consumer values winning — so a consumer can override a default as well as add
  keys;
- state that `attributes` and `references` apply in **`mode: modal` only**, because they are seeded in
  the modal's `onOpen`; page mode carries only the other four in `urlQuery`.

Keep it in the style and voice of the surrounding docblock — a short indented continuation under the
`prefill` entry, matching how the neighbouring vars are documented. The existing note about
`description` being excluded from page-mode `urlQuery` already sits nearby; make sure the two read
consistently rather than contradicting each other.

**Comment only — change no behaviour.** Do not touch `seed_prefill`, the `urlQuery` construction, the
modal wiring, or any var default. Do not "fix" page mode to carry attributes; that would be a
capability change, and no consumer has asked for it.

## Acceptance Criteria

- The docblock lists all seven `prefill` keys.
- It states the `attributes` merge-over-defaults behaviour with consumer precedence.
- It states the modal-mode-only constraint for `attributes` and `references`.
- `git diff` for this task shows changes to comment lines only — no YAML keys or values altered.
- `pnpm ldf:b` from `apps/demo` compiles cleanly (a comment change cannot break it, but the gate is
  cheap).

## Files

- `modules/activities/components/capture_activity.yaml` — modify — docblock only: complete the `prefill` key list and record the modal-mode constraint.

## Notes

- `docs/` is the source of truth for consumer-observable authoring behaviour in this repo. This
  component's behaviour is documented in its own docblock rather than a generated var reference
  (`prefill` is a component var, not a module var), so no `pnpm docs:gen` run is needed — but if a
  hand-written page under `docs/activities/` describes `prefill`, update it to match in the same
  change.
- Fully independent of every other task in this decomposition; it can run at any point.
