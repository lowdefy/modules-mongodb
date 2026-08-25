# @lowdefy/modules-mongodb-ai-assistant

## 0.31.1

### Patch Changes

- [#191](https://github.com/lowdefy/modules-mongodb/pull/191) [`c8390b0`](https://github.com/lowdefy/modules-mongodb/commit/c8390b05e2e384ed8070e0025766b491b274852c) Thanks [@Yianni99](https://github.com/Yianni99)! - The `ai-assistant` module now resolves its `scope` var each time it uses it — minting a thread, listing threads, saving one — rather than once when the page initialises. A scope operator whose value arrives late, such as one reading state populated by an async request, previously froze as null and partitioned every thread under the same empty scope.

  The module still cannot see a scope that changes while the app is running, because nothing in it can observe an app global moving. The docs now carry the recipe for that case: compare `ai_scope` against your own source of truth in `onMount`, which runs on every visit, and clear the open thread when they differ.

  `list-threads` now takes a `$limit` — the thread list is a sidebar with its own search, not an archive, and the pipeline previously grew with a user's whole history for the scope. The module docs also name the two indexes the threads collection wants, and the TTL index for expiring a thread a fixed time after its last activity: the module does not create them, and nothing breaks without them until the collection is large enough that it hurts.

## 0.31.0

### Minor Changes

- [#186](https://github.com/lowdefy/modules-mongodb/pull/186) [`309a157`](https://github.com/lowdefy/modules-mongodb/commit/309a157e9281ba54f150be7a4647cb3f1ce19db5) Thanks [@Yianni99](https://github.com/Yianni99)! - The `ai-assistant` module's chat now takes app behaviour on four events: `on_before_send`, `on_user_message`, `on_data_part` and `on_feedback`. Thread persistence and titling stay the module's own, but an app can now refuse a send before the model is called (a daily question cap, an entitlement check), keep its own record of what was asked, read custom data parts the agent streams, and handle ratings from the feedback control — none of which was possible without forking the chat shell.

  The feedback control remains off unless `message_display` turns it on, and it now has somewhere to send the rating.

## 0.30.0

### Minor Changes

- [#182](https://github.com/lowdefy/modules-mongodb/pull/182) [`98b846f`](https://github.com/lowdefy/modules-mongodb/commit/98b846f5d08136963ef716e331a4ffa8d5714f21) Thanks [@Yianni99](https://github.com/Yianni99)! - New `ai-assistant` module: a persisted, multi-thread chat with one of the app's agents, in two shapes — a docked assistant for any page (an Intercom-style corner launcher and floating panel) and an `embedded` variant that sits inline in a page's own layout. Both share one thread history per (scope, user), with a searchable thread list, in-place rename, delete, and titles generated from each thread's first exchange.

  The module owns the chat shell and the thread lifecycle; it owns no domain knowledge. The agent, what the agent is told about the page (`shared_state`), how threads are partitioned (`scope`), and every string the user reads are vars. Mount `panel` into a page and splice `state` into its `onInit`; a page using `embedded` also splices `enter` (the resume-or-mint chain the panel runs on first open) after it. One shell per page — the two share block ids and state on purpose.

  The plugin package gains what the module rides on:

  - `FloatingPanel` block — a corner launcher + floating panel over a `pointer-events: none` wrapper, so the page behind stays fully clickable (a Drawer masks or reflows it). Children are lazy-mounted then kept mounted across close, and the body publishes its measured height as `--fp-body-height` for children that must fill it exactly.
  - `AiText` connection with a `GenerateChatTitle` request — names a thread from the first exchange (question AND reply) over the Vercel AI Gateway. An agent's own `generateTitle` sees only the opening message, which behind welcome suggestion prompts is one of a handful of canned strings, so every thread comes out with the same name. Best-effort: every failure returns `title: null` and the caller keeps its provisional title.
