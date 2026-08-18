# Task 10: A `setInput` method on `AgentChat`

## Context

The chat page's whole discoverability story rests on one thing the block cannot do: a starter
prompt that **fills** the composer instead of sending it. A starter the user cannot edit is a
demo, not a prompt — and a generic shipped default is only safe because filling leaves it as an
editable first draft.

It is not reachable from config today. In the installed
`@lowdefy/blocks-antd-x` `dist/blocks/AgentChat/AgentChat.js`:

- the `@ant-design/x` `Sender` is mounted **uncontrolled** — `ref: senderRef` with `onSubmit:
handleSend`, no `value` and no `onChange` (around `:595-600`);
- `handlePromptClick(prompt)` calls `sendMessage({ text: prompt.label })` directly (`:411`);
- the registered methods are `regenerate`, `setMessages`, `sendMessage`, `clearMessages`,
  `deleteMessage`, `stop`, `clearError`, `scrollToBottom` (`:192-230`). None writes the input.

The package is already patched in this repo — `patches/@lowdefy__blocks-antd-x.patch` keys
`useChat` by conversation — so patch-then-upstream is a proven path here. The existing patch is
against `dist/`, which is what pnpm's `patchedDependencies` applies to; follow it.

**It is three edits, not two, and the third is where a regression would hide.**
`senderRef.current?.clear()` at `:400` is how the composer empties after a send, and it sits
deliberately **downstream of both** the `onBeforeSend` cancellation return (`if (response.success
=== false) return;`) and the file-upload `await` — so a cancelled or failed send leaves the
user's text in the box. A controlled conversion has to move that clear to a state reset **at the
same point in the flow**. Doing it in `onSubmit` instead silently loses typed input on every
rejected send.

## Interfaces

- **Produces:** `setInput` — a registered `AgentChat` method callable from YAML as

  ```yaml
  - id: fill_composer
    type: CallMethod
    params:
      blockId: chat
      method: setInput
      args:
        - text: <the starter prompt>
  ```

  Match the existing methods' arg convention: `sendMessage` reads `args?.text`, so `setInput`
  reads `args?.text` and treats an absent or non-string value as `""`.

## Task

**Convert the `Sender` to controlled and register the setter.** Three edits to
`dist/blocks/AgentChat/AgentChat.js`:

1. Add local state beside the existing `useState` hooks near the top of the component
   (`const [inputValue, setInputValue] = useState('')`).
2. On the `Sender` element, add `value: inputValue` and `onChange: setInputValue`.
3. Replace `senderRef.current?.clear()` at `:400` with `setInputValue('')` — **at that exact
   line**, after the `sendMessage` calls, not in `onSubmit`. Keep `senderRef` itself; other code
   may hold it.

Then register the method in the `useEffect` that registers the rest:

```js
methods.registerMethod("setInput", (args) => {
  setInputValue(typeof args?.text === "string" ? args.text : "");
});
```

Add it to that effect's dependency array on the same footing as its neighbours.

**Comment the third edit in the patch itself**, in the style of the existing patch's comment
block: the clear stays downstream of the `onBeforeSend` cancellation and the upload await
deliberately, so a rejected or failed send keeps the user's text — moving it into `onSubmit`
loses typed input silently.

**Regenerate the patch** so it carries both hunks (the existing `useChat` `id` keying and this
one), through the repo's normal pnpm patch flow, and confirm `pnpm install` applies it cleanly
and the lockfile's patch hash updates.

## Acceptance Criteria

- `pnpm install` applies the patch with no fuzz, and the patched file in the store contains both
  changes.
- `pnpm ldf:b` from `apps/demo` builds.
- Against a running app: typing in the composer still works (the controlled conversion has not
  broken input); sending clears it; and a send rejected by an `onBeforeSend` handler returning
  `false` **leaves the text in the box**. That last one is the regression this task exists to
  avoid — check it explicitly.
- `CallMethod` with `method: setInput` and `args: [{ text: 'anything' }]` puts that text in the
  composer without sending.
- `setInput` with no `text` clears the composer rather than throwing.

## Files

- `patches/@lowdefy__blocks-antd-x.patch` — modify — the second hunk
- `pnpm-lock.yaml` — modify — the patch hash

## Notes

This patch is ours until it is upstreamed, and a version bump that reworks `AgentChat`'s sender
re-opens it. Keep the diff minimal for exactly that reason — three edits and a registration, no
refactoring of surrounding code.

Do **not** also change `handlePromptClick` to fill instead of send. The block's own `welcome`
property stays unset on this page (task 13 renders the empty state as ordinary blocks above the
chat), so that handler is unreachable here, and changing it would alter behaviour for every other
consumer of the block.
