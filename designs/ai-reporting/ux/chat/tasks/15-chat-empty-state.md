# Task 15: The two-track empty state

## Context

The current welcome is `AgentChat`'s own `welcome` property with a two-line description naming the
panel and the phrase "turn this into a report" — which only works for a user who reads it,
remembers it, and types it later. The module's second job is effectively invisible.

Two tracks of starters make the report path **a thing you can click**, and the split itself is the
teaching device: the left column asks a question, the right builds a report. Starters **fill** the
composer instead of sending, because a starter the user cannot edit is a demo, not a prompt — and
it is what makes a generic shipped default safe: a starter that does not quite fit the app's data
is an editable first draft rather than a dead end.

**This cannot be built inside the block.** `AgentChat`'s `welcome` property takes
`{ title, description, icon, prompts[], variant }` and the block flattens `prompts` into a single
row, mapping only `key` / `label` / `description` — the `children` that `@ant-design/x` uses for
grouped columns are dropped, and the block declares no areas, so nothing can be composed inside
it. So **leave the block's `welcome` property unset** and render the empty state as ordinary
blocks above the chat, shown while `messages` is empty. That is more layout freedom than the
schema would ever have given, and it is only viable because `setInput` exists.

Task 10 added `setInput` to `AgentChat` via the repo's patch. Task 11 declared the `welcome`
namespace var with six leaves: `title`, `data_scope` (**no default**), `explore_label`,
`explore_starters`, `report_label`, `report_starters`.

## Interfaces

- **Consumes:** `_module.var: welcome` (task 11); the `setInput` method on `AgentChat` (task 10),
  called as `CallMethod` with `args: [{ text: … }]`.

## Task

All in `modules/ai-reporting/pages/chat.yaml`, inside `chat_panel`.

**Remove `AgentChat`'s `welcome:` property entirely.** Comment its absence where it was, because
the omission is deliberate and non-obvious: the block flattens its `prompts` into one row and has
no areas, so the two tracks are rendered above the chat instead — and the module's `welcome` var
is a different thing from the block's `welcome` property. Refer to the block's one as "the block's
`welcome`" so the two are never confused by a later reader.

**A new `Box` above the `AgentChat` block**, visible while `messages` is empty
(`_array.length` of `_if_none: [{ _state: messages }, []]` equals 0):

- a `Title` with `_module.var: welcome.title`;
- the **data-scope line** as a `Paragraph` with `_module.var: welcome.data_scope`, `visible:` only
  when that var resolves to a non-empty string. Unset means the line is **not rendered** — never a
  fallback to collection names. Comment that: there is no generic true sentence about what an
  app's assistant can read, and a wrong one is a promise the agent then fails to keep.
- **two track `Box`es** side by side, each with a `Title` (or `Paragraph`, per the plate's weight)
  reading its label var, and a `List` of starter chips over its starters var. Left is
  `explore_label` / `explore_starters`, right is `report_label` / `report_starters`.

**Each starter chip is a `Button`** whose `title` is the starter string and whose `onClick` is a
single `CallMethod`:

```yaml
- id: fill_composer
  type: CallMethod
  params:
    blockId: chat
    method: setInput
    args:
      - text: <the starter string>
```

**Fill, not send.** There must be no `sendMessage` anywhere in this task.

Style the chips as chips rather than primary buttons — `type: default`, wrapping, sized so a
sentence-length starter reads as a suggestion rather than a call to action. Prefer Lowdefy blocks
over `Html`; consult `lowdefy_get_schema` / `lowdefy_get_examples` for `Button`, `List` and `Box`
layout properties.

Use the parent `Box`'s `layout.gap` for spacing between the tracks and between chips before
reaching for per-block margins.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds, and the generated
  `.lowdefy/server/build/pages/reporting/chat.json` shows the resolved default copy for the leaves
  the demo entry does not set and the demo's values for the ones it does (task 16).
- Against a running app on a fresh conversation: both tracks render with labels and starters; the
  data-scope line renders when the demo sets it.
- Clicking a starter **puts its text in the composer without sending**; the user can edit it and
  then send.
- The empty state disappears once the conversation has a message, and reappears on New chat.
- With the demo entry's `data_scope` commented out and the app rebuilt, the line is absent — no
  blank paragraph, no fallback to collection names. Revert after checking.

## Files

- `modules/ai-reporting/pages/chat.yaml` — modify — the block's `welcome` removed, the two-track empty
  state added
- `modules/ai-reporting/pages/chat/components/*.yaml` — create, if a track is extracted

## Notes

Extract a track into a `_ref`'d component file taking its label and starters as `vars` if the
nesting exceeds ~3–4 levels — the two tracks are the same shape twice, which is exactly what
`_ref` + `vars` is for. Use plain `.yaml` with `_var` since the vars appear in operator positions
only; `.yaml.njk` is for string interpolation into ids.

The starter prompts and both labels ship defaults; `data_scope` does not. That asymmetry is a
decision, not an oversight — furniture defaults so discoverability is not opt-in, app facts stay
absent so the module never states something untrue about the app.
