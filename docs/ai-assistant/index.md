---
title: AI Assistant
module: ai-assistant
type: index
concepts: [agent-chat, threads, scope, titling, docked-panel, embedded-chat]
---

# AI Assistant

A persisted, multi-thread chat with one of your app's agents, in two shapes: a **docked assistant** for any page (an Intercom-style corner launcher and floating panel) and an **embedded** variant that sits inline in a page's own layout. Both share one thread history per (scope, user), with a searchable thread list, in-place rename, delete, and titles generated from each thread's first exchange.

The panel never masks or reflows the page. Its wrapper is `pointer-events: none`, so everything behind stays clickable — you can keep working while the assistant is open, and because `shared_state` is read on every message send, the assistant follows whatever you select. That is the whole reason for the pattern; a drawer covers the thing you are asking about.

## What the module owns

The chat **shell** and the **thread lifecycle**: launcher and panel (or the embedded toolbar), the chat block, the thread list, new / open / rename / delete, persistence, and titling.

It owns **no domain knowledge**. The agent, what the agent is told about the page, how threads are partitioned, and every string the user reads are vars. Your app defines the agent under its own `agents:` — the module only takes its id.

## Dependencies

None — the module is standalone. It does need an app agent (`agent_id`) and the [`@lowdefy/modules-mongodb-plugins`](../plugins/index.md) package, which its manifest pulls in.

## Mounting the docked panel

Two things, both required.

**1. The panel**, anywhere in the page's blocks (it positions itself):

```yaml
- _ref:
    module: ai-assistant
    component: panel
    vars:
      agent_id: support
      scope:
        _state: record_id
      visible:
        _state: loaded
      panel_title: Assistant
      panel_subtitle: Support assistant
      shared_state:
        record_id:
          _state: record_id
      welcome:
        title: Assistant
        prompts:
          - label: What can you help with?
      tag:
        _state: record_title
```

**2. The state contract**, spliced into the page's `onInit`:

```yaml
onInit:
  _build.array.concat:
    - - id: init_state
        type: SetState
        params: { ...the page's own state... }
    - - _ref:
          module: ai-assistant
          component: state
```

Without it, Lowdefy raises a ConfigWarning for every `ai_*` key the chat reads. Keeping the list inside the module means adding a key never silently breaks a consumer. All keys are `ai_`-prefixed, so they cannot collide with the page's.

## Mounting the embedded variant

The embedded shell renders the same chat and thread lifecycle inline — a toolbar (thread name, rename, delete, new chat, manage chats) over the chat area. The page owns the container: put it inside whatever Card or column the layout calls for, and size it with the `embedded_height` var.

```yaml
- id: assistant_card
  type: Card
  blocks:
    - _ref:
        module: ai-assistant
        component: embedded
```

Because there is no "open" moment, the page also splices the module's `enter` chain (resume-or-mint) into `onInit`, **after** `state` — and wraps the event in a `try`/`catch` that clears `ai_loading`, mirroring what the panel does on open. Without the catch, a transient fetch failure aborts the chain before `enter`'s final step clears the flag, and the chat spins forever:

```yaml
onInit:
  try:
    _build.array.concat:
      - - _ref:
            module: ai-assistant
            component: state
      - _ref:
          module: ai-assistant
          component: enter
  catch:
    - id: ai_end_loading_on_error
      type: SetState
      params:
        ai_loading: false
```

**One shell per page.** `panel` and `embedded` share block ids and `ai_*` state on purpose — that is what gives them one thread history — so never mount both on the same page. An app-wide docked launcher should be hidden (its `visible` var) on pages that embed.

## Scope

`scope` is the string that partitions threads. Threads are listed and created against `(scope, session user)`, so the same page in a different scope is a different set of chats. Pass a state operator for a per-record assistant (`{_state: record_id}`), or a constant for a single global one.

The operator is resolved **each time it is used** — when a thread is minted, listed, or saved — not once at page init. So a scope whose value arrives late (state populated by an async request, for example) is not frozen as null.

**A scope that CHANGES mid-session needs one thing from the consumer.** Nothing in the module can observe an app global or a page state key moving, so an already-open thread and its list stay as they were until something re-enters. If your scope can change while the app is running — an active-company or active-record switcher, typically — compare `ai_scope` (the scope at page init) against your own source of truth on every visit, and clear the open thread when they differ. `onInit` runs once per page per session; `onMount` runs on every visit, so the check belongs there:

```yaml
onMount:
  _build.array.concat:
    - - id: rescope_on_change
        type: SetState
        skip:
          _eq:
            - _state: ai_scope
            - _global: active_company_id   # your source of truth
        params:
          ai_scope:
            _global: active_company_id
          ai_view: chat
          ai_conversation_id: null
          ai_messages: []
          ai_threads: []
          ai_thread_selection: null
          ai_title: New chat
    # A page hosting `embedded` re-runs `enter` here too — it is a no-op while a thread is
    # open, and the null id above is what makes it resume in the new scope. A page carrying
    # the docked panel needs nothing more: the panel runs `enter` on open.
    - _ref:
        module: ai-assistant
        component: enter
```

Clearing `ai_conversation_id` is the whole mechanism: `enter` treats a null id as a first entry and resumes the most recent thread in the new scope.

## Titles

Threads are named from their **first exchange** — the opening question and the reply — once the first reply lands.

Do not use an agent's `generateTitle` alongside this. That titles from the opening message alone, and where a welcome screen offers suggestion prompts the opening message is one of a handful of canned strings, so every thread ends up named after the question rather than the subject. The subject is almost always in the reply.

The provisional title (the user's first message, truncated) still appears instantly and is replaced a moment later, so a thread is never briefly nameless. If titling fails the provisional one simply stays. Set `generate_titles: false` to skip the model call entirely — the `AI_GATEWAY_API_KEY` secret is only exercised while titling is on.

Two vars sharpen the generated names: `title_context` (one line of grounding, e.g. `"Acme Ltd — onboarding"`) lets the model name the subject when the exchange only ever says "this record", and `title_domain` (e.g. `"a staffing and payroll tool"`) grounds its vocabulary. `title_model` picks the gateway model — small and fast is the right choice.

## Tags

`tag` is a display **label**, accumulated as a set and shown as chips on the thread cards. It is stored as the string, not an id — the module cannot resolve app ids, and a thread list is a historical record of what was discussed. The trade-off is that renaming the underlying record does not retitle old chips.

## App behaviour on the chat

The module owns the thread lifecycle on `onUserMessage` and `onMessageComplete` and will not hand that over. A thread is persisted twice: once when the message is sent, and again when the reply completes. The first save is what makes a thread survive a client that leaves mid-stream — without it the thread was never created, and the question went with it. Everything else an app might want to do around a message is a var, each a list of actions run on the corresponding chat-block event:

| Var | Event | For |
|---|---|---|
| `on_before_send` | `onBeforeSend` | Refuse a send — `Throw` here. The only seam that runs *before* the model is called, so quotas and entitlement checks belong here. |
| `on_user_message` | `onUserMessage` | The app's own record of what was asked. Runs after the module has persisted the thread, so a thread id is already stored by this point. |
| `on_data_part` | `onDataPart` | Custom data parts the agent streams. Filter on the part type yourself; every part arrives here. |
| `on_feedback` | `onFeedback` | Ratings from the feedback control. |
| `on_link_click` | `onLinkClick` | A link clicked inside a message, as `{ href, text }`. Open an in-app target in place instead of navigating out of the conversation. Wiring it turns interception on for the whole message, so an href you do not recognise navigates nowhere — handle the fall-through. Modified and non-primary clicks are never delivered, so open-in-new-tab keeps working. |

Each event brings its own `_event` payload from the chat block, and they do not agree on field names — `onBeforeSend` gives you `{ text, files, messages, switches }`, so a rule about what the user typed reads `_event: text`, not `content`. Reading a field the event does not carry yields null silently, which in a `skip` reads as "skip this action" — a gate written against the wrong field does not error, it just never fires. Worth a check against the block's reference when writing one.

The feedback control is off by default. Turning it on is a `message_display` change, and it needs `on_feedback` to do anything:

```yaml
message_display:
  actions: [copy, feedback]
on_feedback:
  - id: record_rating
    type: CallAPI
    params:
      endpointId: rate-answer
      payload:
        rating:
          _event: rating
```

A quota gate, for contrast, refuses the send outright:

```yaml
on_before_send:
  - id: recheck_quota
    type: Request
    params: check_quota
  - id: block_when_capped
    type: Throw
    skip:
      _lt:
        - _request: check_quota.0.n
        - 30
    params:
      throw: true
      message: You have reached today's question limit.
```

## Requirements

- An app agent whose id is passed as `agent_id`.
- `@lowdefy/modules-mongodb-plugins` — ships the [`FloatingPanel`](../plugins/floating-panel.md) block and the `AiText` connection used for titling.
- Secrets `MONGODB_URI` and (while `generate_titles` is on) `AI_GATEWAY_API_KEY`.
- **Two indexes on the threads collection.** The module does not create them; nothing breaks
  without them until the collection grows, which is the worst time to find out.

  | Index | Serves |
  |---|---|
  | `{ scope: 1, user_id: 1, updated: -1 }` | `list-threads`, which matches on scope and the session user and sorts newest-first. The whole index, in order — a partial one still sorts in memory. |
  | `{ conversationId: 1, user_id: 1 }` | the other four endpoints: get, save, rename, delete all filter on exactly this pair. |

  The thread list is capped at 200 per (scope, user), newest first. The threads view searches client-side over that window, so a user holding more chats than the cap in one scope cannot reach the older ones — an app expecting that needs pagination in `list-threads`, not a larger cap.

  A **TTL index** is also worth having where threads should expire — the module stamps
  `updated` on every save, so `{ updated: 1 }` with `expireAfterSeconds` set to your retention
  period expires a thread a fixed time after its last activity, not after its creation.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
