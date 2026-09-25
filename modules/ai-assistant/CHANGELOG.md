# @lowdefy/modules-mongodb-ai-assistant

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

### Minor Changes

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`c222639`](https://github.com/lowdefy/modules-mongodb/commit/c2226394d747fb08beeb7e210e9a908be7abb592) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: say when the assistant is unavailable

  An app that has stopped the assistant — a workspace out of AI credits, a paused tenant — had
  nowhere to say so. The chat still offered a composer, and a message sent into it failed on its
  own terms, which reads as the assistant being broken rather than switched off.

  The new `notice` var takes `{ type, message, description }` and replaces the conversation with
  that alert, taking the composer with it. The thread list stays reachable, so earlier answers can
  still be read. Null, the default, shows the chat as normal.

### Patch Changes

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`f4f3ada`](https://github.com/lowdefy/modules-mongodb/commit/f4f3adaac16c47a7f49ffe66e6bed8f636a09cd0) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: run `on_thread_change` when the open thread is deleted

  Deleting the open thread mints a fresh conversation to land in, which is the active thread
  changing by a user action — but `delete-thread` never ran `on_thread_change`, so a consuming
  app was not told. Anything derived from the open conversation and rendered outside the chat
  kept describing the thread that had just been deleted, and stayed that way until the user
  opened another one. That reads as wrong data rather than as missing data.

  `new-thread` and `select-thread` already ran the seam; this was the third way the active
  thread can change, and the only one that did not.

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`dbcd7b7`](https://github.com/lowdefy/modules-mongodb/commit/dbcd7b7b23bb084efb0f3b4cce1ac9beb5639c8f) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: survive a turn that is cut off mid-stream

  A reply that stopped early left its tool call with no result. That pairing cannot be sent back
  to the model, so every later message on the thread failed before it reached one, and the thread
  could not be opened again either — the stored history no longer validated. One interrupted reply
  therefore killed the conversation permanently, and the only signal was that nothing happened.

  Unresolved tool calls are now dropped when the history is saved and again when a thread is
  loaded, along with any message left carrying nothing. The load side is what brings threads
  already stored in that state back.

  A turn that ends without an answer also says so. This is not an error the chat can report —
  the stream closes normally and only carries nothing — so it went by in silence, which reads as
  the assistant ignoring the question and invites the same question again.

  Deleting a single message now keeps the stored thread in step. Regenerating or editing one
  already did, because each ends in a send the thread is saved from; deleting ends there, so the
  message came back on the next reload.

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`dc1c696`](https://github.com/lowdefy/modules-mongodb/commit/dc1c6967631b97c371600f83a8f4a80f35334535) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: the threads index on `{ conversationId, user_id }` should be unique

  Saving a thread upserts on that pair. Two saves that race and both find no existing row will
  both insert, and MongoDB allows it unless the index is unique — so one conversation ends up
  stored twice, showing twice in the list, with whichever row the query reaches first being the
  one that reads back. The index was already recommended for speed; it is needed for correctness
  too. Apps that added it as non-unique should replace it.

## 0.40.0

### Minor Changes

- [#229](https://github.com/lowdefy/modules-mongodb/pull/229) [`82473ca`](https://github.com/lowdefy/modules-mongodb/commit/82473ca1f790082ffeb45920ae8015969f0a335f) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: let an app colour the chat where it currently inherits antd's primary

  Three surfaces took their colour from `--ant-color-primary*` with no way to change it: the
  selected chat in the thread list, the embedded toolbar's buttons, and the assistant's name chip
  in the docked panel. That is right where the app's primary IS its accent, and wrong where it is
  a neutral — an app with a grey `colorPrimary` gets a grey selected chat that looks hovered, and
  a grey name chip on a grey tint, which is the one thing that chip exists to avoid. Nothing an
  app could write in its own stylesheet fixed it: the thread list's selected class is generated,
  and the panel's chip rule lands at the same specificity a consumer can reach, so the two tie
  and the plugin wins on order.

  - `thread_selection` — `{ border, background }` for the selected chat.
  - `toolbar` — `{ size, accent, accent_text, secondary }` for the embedded shell's toolbar: the
    antd button size, the fill marking the primary action, and the fill behind the rest.
  - `--fp-role-assistant-bg` / `--fp-role-assistant-fg` — CSS custom properties the FloatingPanel
    stylesheet now reads for the assistant's name chip.

  The chat title's size is also pinned to 1rem. `level: 5` asked for a semantic heading, so the
  title took whatever the consuming app decided `h5` means — an app that styles h5 as metadata,
  which is a common choice, rendered the chat title at secondary-text size. A consumer that had
  deliberately sized the title through `h5` will now see 1rem instead.

  Decisions:

  - Every default is today's value, so no existing consumer changes appearance. `toolbar.size`
    stays `small` for the same reason, even though 24px is slight for what are the shell's
    primary actions — an app that wants bigger now says so.
  - `toolbar` covers the embedded shell only. The panel's buttons are icon-only in a 420px
    column, where `small` is right and a fill would read as chrome rather than as an action.
  - The toolbar fills are set on the blocks via their `.element` css key rather than left to a
    consumer stylesheet. Reaching those buttons from outside means selecting on module-internal
    block ids, which a release can rename with nothing raising an error on the consumer's side.
  - The panel chip uses CSS custom properties rather than a var, because the rule lives in the
    plugin's stylesheet and never passes through the module's var resolution.

- [#229](https://github.com/lowdefy/modules-mongodb/pull/229) [`82473ca`](https://github.com/lowdefy/modules-mongodb/commit/82473ca1f790082ffeb45920ae8015969f0a335f) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: ask before deleting a chat

  Delete chat destroyed the open thread on the click. `delete-thread.yaml` went straight to the
  delete endpoint, and neither the embedded toolbar's button nor the panel's carried a guard, so
  one stray click took the conversation and every answer in it, and the control sits directly
  beside "New chat" and "Manage chats", which is where a mis-click lands.

  Both shells now open a confirm first, naming the thread. (The delete itself is soft as of the
  accompanying change, so the confirm's wording stops at the chat leaving the user's list rather
  than claiming the conversation is destroyed.)

  Decisions:

  - No var to switch it off. A confirm nobody opted into is a confirm nobody has, and the cost
    is one extra click on the rarest action in the shell. That makes this a behaviour change for
    existing consumers, hence minor rather than patch — a delete that used to happen now waits
    for an answer.
  - `ConfirmModal`, not the `Modal` that ai-reporting's delete confirm uses. The panel stacks at
    1100 and the `Modal` block does not forward `zIndex`, so a `Modal` would open behind the
    panel that launched it. `ConfirmModal` does forward it; 1200 matches the panel's own
    tooltips. ai-reporting's modal sits on an ordinary page and never had to clear a panel.
  - `delete-thread.yaml` is unchanged and runs from `onOk`. It already captures
    `ai_conversation_id` before replacing it, so nothing is seeded for the confirm and
    cancelling leaves no state behind.

- [#229](https://github.com/lowdefy/modules-mongodb/pull/229) [`bfe0493`](https://github.com/lowdefy/modules-mongodb/commit/bfe049331c40f5af80517f96ce82d1c6450a4c62) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: deleting a chat no longer destroys it

  Delete chat removed the thread from the collection outright. It was the only hard delete left in
  the repo — every other module that deletes its own documents marks them with a `deleted` change
  stamp and filters them out of reads. A chat is the user's own record of what they asked and what
  they were told, and the confirm added alongside this is a prompt, not a safeguard: it cannot
  help the person who meant to click it and then wanted the thread back.

  Deleting now sets the `deleted` stamp, which also records who deleted the thread and when, and
  every read filters on it — the thread list, the resume-on-open lookup, the message replay, and
  the rename and generated-title writes.

  Decisions:

  - The stamp is written from the module's own `defaults/change_stamp.yaml` rather than the events
    module's exported component, because this module declares no dependencies. Same choice, and
    the same shape, as ai-reporting — so a host app reads it with one predicate across every
    module.
  - No restore control, and none planned here. The point is that the conversation survives a
    stray click; recovering one is an operator action against the collection. Adding a deleted-
    chats view would be a second feature, and pretending to offer recovery in the confirm would
    be worse than saying nothing.
  - The confirm's copy changed with it. It used to say the chat was "deleted for good" and could
    not be undone, which is no longer true — it now says the chat is removed from the user's
    chats and cannot be opened again, which is what the user actually experiences.
  - The read predicate is deliberately absent from `save-thread`'s filter. That filter drives an
    upsert, and `$exists` is not an equality clause, so a no-match would mint a second row under
    the same conversationId rather than skip the write. A save already in flight when the delete
    lands therefore rewrites the deleted row's messages but leaves the stamp intact, so the
    thread stays gone from every read. `deleted: null` is initialised on insert instead, so live
    threads have one shape.
  - `disableNoMatchError` is set, and is load-bearing rather than tidy-up. `MongoDBDeleteOne`
    never complained about matching nothing, but `MongoDBUpdateOne` throws "No matching record to
    update." on a zero match unless the flag is set or the write is an upsert — so switching to
    an update would otherwise have turned two harmless cases into errors: deleting a thread that
    was minted but never sent in (no row exists until the first message is saved), and a repeat
    delete. Both now report zero modified, and a repeat can no longer overwrite the original
    stamp's who and when.

  Minor rather than patch: existing rows are untouched and reads treat a missing `deleted` field
  as live, so nothing needs migrating — but a consumer that counted on the collection shrinking,
  or that reads the collection itself rather than through the module's endpoints, now sees
  deleted threads and has to apply the same predicate.

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

### Minor Changes

- [#205](https://github.com/lowdefy/modules-mongodb/pull/205) [`1c35006`](https://github.com/lowdefy/modules-mongodb/commit/1c35006132524afc63671864c18ae31e5d1ec532) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: add a `feedback_values` var so stored ratings come back

  The chat block persists no rating: `on_feedback` hands one to the app and the app stores
  it. There was no way to hand it back, so a reload or a thread switch showed every message
  unrated even where the app had recorded the rating — a lost write rather than a display
  gap, as far as the user could tell.

  `feedback_values` takes a map of message id to `like` or `dislike`, in the same vocabulary
  `on_feedback` reports. A rating clicked during the visit takes precedence, so the thumb
  still responds immediately.

  Rebuild the map for the thread being opened, on both seams that open one. `on_thread_change`
  covers every switch, and a new `on_panel_open` var covers the thread the `panel` resumes when
  it opens — which nothing could see before, because `enter` runs inside the panel and no
  consumer actions followed it. Wiring only `on_thread_change` leaves the thumbs missing on the
  thread the user lands on and appearing once they switch, which is the confusing half-state.
  The `embedded` shell still has no open moment: a page using it splices its own actions after
  the `enter` component, as before.

  Requires Lowdefy 5.6.0, the release carrying the AgentChat `feedbackValues` property; on
  an older build the property is ignored and nothing changes. The plugin package's Lowdefy
  peer range now accepts `5.6.0` and no longer accepts
  `0.0.0-experimental-20260827105525` — that build predates the property, so it was only
  ever the pre-release stand-in for this release.

## 0.36.0

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
