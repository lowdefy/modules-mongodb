# @lowdefy/modules-mongodb-ai-assistant

## 0.35.0

### Minor Changes

- [#203](https://github.com/lowdefy/modules-mongodb/pull/203) [`5324a5e`](https://github.com/lowdefy/modules-mongodb/commit/5324a5eba59323d41eecfe45687ba30107854f98) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: resume the thread you last opened, and add an `on_thread_change` seam

  Reloading dropped you into the wrong conversation. `enter` resumed the first item of
  `list-threads`, which is sorted `updated: -1`, and `updated` only moves when a message
  is saved — so merely reading a thread never marked it current, and a refresh landed you
  in whichever thread you had last SENT in. Opening a thread now stamps `last_opened`, and
  a new `get-active-thread` endpoint answers "what should I resume?" separately from "what
  order should the list be in?". The sidebar keeps its send-order, so reading a thread no
  longer reshuffles the list.

  Threads stored before this change have no `last_opened` and fall back to `updated`, which
  is the old behaviour — nothing needs migrating.

  The new `on_thread_change` var runs actions whenever the active thread changes by a user
  action: a thread opened from the list, or a new chat started. Anything a consuming app
  derives from the open conversation and renders outside the chat — a references panel,
  filters keyed to the current answer — previously had no way to know a switch had
  happened. It was built once on mount and from then on silently described the wrong
  thread, which reads as stale data rather than as missing data. `enter` deliberately does
  not fire it: a page splices its own actions after `enter` already, and firing both would
  run them twice on the first visit.

  Read the new thread from `ai_conversation_id` rather than the event — the two call sites
  deliver different events, and only the state is common to both.

## 0.34.0

### Minor Changes

- [#201](https://github.com/lowdefy/modules-mongodb/pull/201) [`fa99a04`](https://github.com/lowdefy/modules-mongodb/commit/fa99a04e93f6fc17244cb959d63169ab76d764e0) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: add an `on_link_click` var, and soften the selected-thread highlight

  A link in an answer was a plain anchor, so following a citation was a full browser
  navigation out of the conversation with no way for an app to show the target in
  place. `AgentChat` now carries an `onLinkClick` event, and this exposes it as the
  `on_link_click` seam alongside `on_before_send`, `on_user_message`, `on_data_part`
  and `on_feedback`. The event gives you `href` and `text`.

  It is wired only when you supply actions. The block decides whether to intercept a
  click from the event's presence, and an event declared with an empty action array is
  still present — so passing the var through unconditionally would suppress every
  anchor in every consuming app and then run nothing. Wiring nothing changes nothing.

  Two things to know once you do wire it: an href you do not recognise navigates
  nowhere, because interception covers the whole message, so handle the fall-through;
  and modified or non-primary clicks are never delivered, so open-in-new-tab keeps
  working.

  The manage-chats list also passes its own `.selected` style now. `ListSelector`
  defaults to a primary border plus a `0 0 0 1px` primary ring, and a box-shadow ring
  keeps the radius it is given rather than growing to stay concentric — so the two
  curves fell out of phase and every corner rendered thick and faceted. It is now one
  soft primary border over a tinted fill, from theme tokens, so it follows dark mode
  and your own primary colour.

  Also widens the plugin package's Lowdefy peer range to accept
  `0.0.0-experimental-20260827105525`, the first published build carrying the event.

## 0.33.0

## 0.32.1

### Patch Changes

- [#195](https://github.com/lowdefy/modules-mongodb/pull/195) [`1d636ab`](https://github.com/lowdefy/modules-mongodb/commit/1d636ab506af9e5e528fbaa41366646a91fa6cbf) Thanks [@Yianni99](https://github.com/Yianni99)! - A thread now survives leaving the page mid-answer. Threads were persisted only when the reply finished streaming, from the chat block's `onMessageComplete` on the client, so sending a message and navigating away before the answer landed saved nothing at all: the thread was never created, leaving no history to resume and no record of what had been asked.

  The module now also saves on `onUserMessage`, whose payload already carries the message just sent. The worst case becomes a thread missing its answer rather than a thread that never existed, and it is named from the question rather than left as "New chat" — the provisional-title derivation is now a shared action used by both save paths, so the two cannot drift apart.

  `on_user_message` still runs after the module's own steps, so a consumer's actions on that event now see a thread that is already stored.

  This persists the question, not the answer: the reply is only ever known to the client that received it. An app that needs the answer in its stored history should write it from its agent's `onFinish` hook, which is awaited server-side and so still runs once the client has gone.

## 0.32.0

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
