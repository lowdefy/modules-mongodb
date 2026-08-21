# @lowdefy/modules-mongodb-ai-assistant

## 0.30.0

### Minor Changes

- [#182](https://github.com/lowdefy/modules-mongodb/pull/182) [`98b846f`](https://github.com/lowdefy/modules-mongodb/commit/98b846f5d08136963ef716e331a4ffa8d5714f21) Thanks [@Yianni99](https://github.com/Yianni99)! - New `ai-assistant` module: a persisted, multi-thread chat with one of the app's agents, in two shapes — a docked assistant for any page (an Intercom-style corner launcher and floating panel) and an `embedded` variant that sits inline in a page's own layout. Both share one thread history per (scope, user), with a searchable thread list, in-place rename, delete, and titles generated from each thread's first exchange.

  The module owns the chat shell and the thread lifecycle; it owns no domain knowledge. The agent, what the agent is told about the page (`shared_state`), how threads are partitioned (`scope`), and every string the user reads are vars. Mount `panel` into a page and splice `state` into its `onInit`; a page using `embedded` also splices `enter` (the resume-or-mint chain the panel runs on first open) after it. One shell per page — the two share block ids and state on purpose.

  The plugin package gains what the module rides on:

  - `FloatingPanel` block — a corner launcher + floating panel over a `pointer-events: none` wrapper, so the page behind stays fully clickable (a Drawer masks or reflows it). Children are lazy-mounted then kept mounted across close, and the body publishes its measured height as `--fp-body-height` for children that must fill it exactly.
  - `AiText` connection with a `GenerateChatTitle` request — names a thread from the first exchange (question AND reply) over the Vercel AI Gateway. An agent's own `generateTitle` sees only the opening message, which behind welcome suggestion prompts is one of a handful of canned strings, so every thread comes out with the same name. Best-effort: every failure returns `title: null` and the caller keeps its provisional title.
