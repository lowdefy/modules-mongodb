---
title: AI Assistant
module: ai-assistant
type: index
concepts: [agent-chat, threads, scope, titling, docked-panel, embedded-chat]
---

# AI Assistant

A persisted, multi-thread chat with one of your app's agents, in two shapes: a **docked assistant** for any page (an Intercom-style corner launcher and floating panel) and an **embedded** variant that sits inline in a page's own layout. Both share one thread history per (scope, user), with a searchable thread list, in-place rename, delete behind a confirmation, and titles generated from each thread's first exchange.

The panel never masks or reflows the page. Its wrapper is `pointer-events: none`, so everything behind stays clickable — you can keep working while the assistant is open, and because `shared_state` is read on every message send, the assistant follows whatever you select. That is the whole reason for the pattern; a drawer covers the thing you are asking about.

## What the module owns

The chat **shell** and the **thread lifecycle**: launcher and panel (or the embedded toolbar), the chat block, the thread list, new / open / rename / delete, persistence, and titling.

It owns **no domain knowledge**. The agent, what the agent is told about the page, how threads are partitioned, and every string the user reads are vars. Your app defines the agent under its own `agents:` — the module only takes its id.

## Dependencies

None — the module is standalone. It does need an app agent (`agent_id`) and the [`@lowdefy/modules-mongodb-plugins`](../plugins/index.md) package, which its manifest pulls in.

## Mounting the docked panel

Two things, both required.

**1. The panel**, anywhere in the page's blocks (it positions itself). The component takes no vars of its own; everything it reads is a module var, set on the module entry:

```yaml
# modules.yaml
- id: ai-assistant
  source: github:lowdefy/modules-mongodb/modules/ai-assistant@v1.4.0
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

```yaml
# the page's blocks
- _ref:
    module: ai-assistant
    component: panel
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

**Every open shows the stored thread.** The open thread lives in page state, one copy per page, and Lowdefy keeps a page's state when the user comes back to it. So each time the panel opens with a thread already showing, `enter` re-reads the thread the user last opened in the scope and replaces the one showing, without a spinner: messages sent on another page since, or a thread switched to there, show without a refresh. A reply streaming on this page keeps what it shows. When the fetch fails, or the scope has no stored thread yet, the thread showing stays. A new chat not yet sent in is not stored, so closing and reopening the panel takes the user back to the thread they last opened.

## Mounting the embedded variant

The embedded shell renders the same chat and thread lifecycle inline — a toolbar (thread name, rename, delete, new chat, manage chats) over the chat area. The page owns the container: put it inside whatever Card or column the layout calls for, and size it with the `embedded_height` var.

Delete asks first, in both shells, and the confirm names the thread. It is not configurable: there is no var to turn it off.

The delete is **soft** — it sets a `deleted` [change stamp](../shared/soft-delete.md) and every read filters the thread out, so the conversation survives the click and the stamp records who deleted it and when. Nothing in the shell reads a deleted thread back and there is no restore control, so the confirm tells the user the chat goes without offering them recovery: bringing one back is an operator action against the collection.

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

## Opening the panel with a prompt

`open-with-prompt` is an action list for a button anywhere on a page that mounts `panel`. It opens the panel on a **new** thread and sends the prompt into it, whether the panel is open on another thread, closed, or was never opened on this page:

```yaml
- id: explain_record
  type: Button
  properties:
    title: Ask the assistant
  events:
    onClick:
      _ref:
        module: ai-assistant
        component: open-with-prompt
        vars:
          prompt:
            _string.concat:
              - "Explain the status of "
              - _state: record.name
```

`prompt` is a string or a runtime operator, resolved when the button is clicked. The earlier thread stays in the thread list, untouched.

It runs `enter` first (so a panel that was never opened still gets its thread list), then remounts the chat on the new thread before sending, which takes a fraction of a second after the panel opens. A rejected thread fetch ends it with the panel still closed; the panel clears its own spinner the next time it opens.

It needs the `panel` shell: on a page using `embedded` there is no panel to open. And, like the welcome prompts, its send does not run `on_before_send`, so a quota gate there does not see it.

## Scope

`scope` is the string that partitions threads. Threads are listed and created against `(scope, session user)`, so the same page in a different scope is a different set of chats. Pass a state operator for a per-record assistant (`{_state: record_id}`), or a constant for a single global one.

The operator is resolved **each time it is used** — when a thread is minted, listed, or saved — not once at page init. So a scope whose value arrives late (state populated by an async request, for example) is not frozen as null.

**A scope that changes mid-session** — an active-company or active-record switcher, typically — is picked up by `enter`. It keeps the scope the open thread belongs to in `ai_scope`, and when the `scope` var no longer matches, it drops the open thread and its list and resumes the thread last opened in the new scope. Nothing in the module can observe the scope moving, so this happens the next time `enter` runs. The panel runs it on every open, so a page carrying the docked panel needs nothing more. A page hosting `embedded` runs it in `onInit`, which fires once per page per session, so it also splices `enter` into `onMount`, which runs on every visit. While the scope is unchanged it re-reads the stored thread there, as the panel does on each open:

```yaml
onMount:
  try:
    _ref:
      module: ai-assistant
      component: enter
  catch:
    - id: ai_end_loading_on_error_mount
      type: SetState
      params:
        ai_loading: false
```

A scope that moves while the chat is on screen, with no visit or open in between, is picked up at the next one.

## Titles

Threads are named from their **first exchange** — the opening question and the reply — once the first reply lands.

Do not use an agent's `generateTitle` alongside this. That titles from the opening message alone, and where a welcome screen offers suggestion prompts the opening message is one of a handful of canned strings, so every thread ends up named after the question rather than the subject. The subject is almost always in the reply.

The provisional title (the user's first message, truncated) still appears instantly and is replaced a moment later, so a thread is never briefly nameless. If titling fails the provisional one simply stays.

**A name the user typed is theirs.** Renaming a chat before its first reply lands skips titling for it, and a rename while the title is generating wins: the endpoint only replaces the provisional title it was given. After a thread is first saved its title changes only by a rename or by titling, never by a later save, so a tab holding an older name cannot put that name back. Set `generate_titles: false` to skip the model call entirely — the `AI_GATEWAY_API_KEY` secret is only exercised while titling is on.

Two vars sharpen the generated names: `title_context` (one line of grounding, e.g. `"Acme Ltd — onboarding"`) lets the model name the subject when the exchange only ever says "this record", and `title_domain` (e.g. `"a staffing and payroll tool"`) grounds its vocabulary. `title_model` picks the gateway model — small and fast is the right choice. The titling call is sent the first question and reply, so where the agent routes with `zeroDataRetention`, set `title_zero_data_retention: true` to hold titling to the same providers.

## Tags

`tag` is a display **label**, accumulated as a set and shown as chips on the thread cards. It is stored as the string, not an id — the module cannot resolve app ids, and a thread list is a historical record of what was discussed. The trade-off is that renaming the underlying record does not retitle old chips.

## Composer note

`composer_note` puts a short fixed note of small secondary text under the composer, in both the docked panel and the embedded shell, e.g. a reminder not to share personal information. It shows whenever the conversation does and is never added to it, so the transcript stays clean. Inside the panel the chat gives up a fixed 56px to it, so a note longer than about three lines at the panel's width is clipped. Keep it to a sentence or two.

## Attachments

Attachments are off by default. `sender_attachments` turns them on and is passed through as the chat block's `sender.attachments`. A file can then be picked, pasted or dropped onto the composer:

```yaml
sender_attachments:
  enabled: true
  accept: image/*,.pdf
  maxSize: 5242880
  uploadPolicyRequestId: chat_upload_policy
  downloadPolicyRequestId: chat_download_policy
file_links_endpoint: chat-file-links
```

The two requests belong to the app, on every page that mounts the chat, for example in the layout's global requests. The module adds none. The upload request returns a storage upload policy, such as an `AwsS3PresignedPostPolicy`. The download request turns the uploaded file into the link the model provider fetches, such as an `AwsS3PresignedGetObject` with a long `expires`. Its key comes from the browser, so sign it only when it is one of the caller's uploads, for example when it starts with the prefix the upload request gives them. Each uploaded file part keeps its storage key at `providerMetadata.lowdefy.key`, beside that link. The thread is saved with both.

A signed link stops working: S3 signs one for seven days at most. A thread reopened after that would send the model links it cannot read. Set `file_links_endpoint` to an app endpoint that signs new ones. When a thread is opened (`get-thread`, and `get-active-thread` on resume), the module collects the file parts that carry a key, each key once, and calls the endpoint once with:

```yaml
files:
  - key: uploads/user-1/3f2a/screenshot.png
    filename: screenshot.png
    mediaType: image/png
```

The endpoint returns `{ files: [{ key, url }] }`. Each part's `url` becomes its key's new link. A key returned with `url: null`, or left out, keeps the link the thread stored. A thread with no keyed parts makes no call, and neither does a part sent inline with no upload request.

The keys come from messages the browser saved, so check that each one is the caller's before signing it, for example that it starts with the prefix the upload request gives the caller's uploads. Answer `url: null` for any other key, or leave it out. The endpoint runs as the person opening the thread, so `_user` is theirs, and it can be an `InternalApi`, since only the module calls it:

```yaml
id: chat-file-links
type: InternalApi
routine:
  - :set_state:
      prefix:
        _string.concat: [uploads/, { _user: id }, /]
      links: []
  - :for: file
    :in:
      _payload: files
    :do:
      - :if:
          _string.startsWith:
            - _item: file.key
            - _state: prefix
        :then:
          - id: sign
            type: AwsS3PresignedGetObject
            connectionId: files-bucket
            properties:
              key:
                _item: file.key
              expires: 604800
          - :set_state:
              links:
                _array.concat:
                  - _state: links
                  - - key:
                        _item: file.key
                      url:
                        _step: sign.$ # this iteration's result
  - :return:
      files:
        _state: links
```

The endpoint is called on every open of a thread holding files, so keep it to signing.

### Screenshot

`screenshot: true` adds a **Take screenshot** button to the docked panel's footer. It draws the page behind the panel (the panel itself is left out), blanks every password input, every `[data-support-mask]` element and every match of `screenshot_mask_selectors`, then opens an editor where the user can blur or crop it and choose **Use** or **Retake**. **Use** puts the image in the composer as an attachment, the same as one picked with the paperclip: it uploads on send through the `uploadPolicyRequestId` request, under the prefix that request gives the user, and the thread keeps its storage key.

```yaml
sender_attachments:
  enabled: true
  accept: image/*,.pdf
  uploadPolicyRequestId: chat_upload_policy
  downloadPolicyRequestId: chat_download_policy
screenshot: true
screenshot_mask_selectors:
  - .account-number
```

It needs `sender_attachments.enabled`, and the composer's `accept` list and `maxSize` must allow a PNG. It is not part of the embedded shell. The button is disabled in the thread list and under a `notice`. The capture is the [SupportScreenshot](../plugins/support-screenshot.md) block's, with its limits.

## Colours

The user's bubble, the outlined reply border and the composer border take the theme's `colorPrimary`, applied inline, so a page stylesheet cannot recolour them. Where the primary doesn't suit, pass the chat block's `styles` (or `classNames`) instead: per bubble part under `message_display.roles.user` and `.assistant`, and per composer part under `sender`.

```yaml
message_display:
  roles:
    assistant:
      variant: borderless   # `roles` replaces the module's whole key, so restate it
    user:
      styles:
        content:
          background: '#0f766e'
          color: '#ffffff'
sender:
  styles:
    root:
      borderColor: '#0f766e'
```

## App behaviour on the chat

The module owns the thread lifecycle on `onUserMessage` and `onMessageComplete` and will not hand that over. The browser saves a thread twice: once when the message is sent, and again when the reply completes. The first save creates the thread, so it survives a client that leaves mid-stream. The reply itself reaches it from the server through the agent's `onFinish` hook (see [Replies that finish after the page changes](#replies-that-finish-after-the-page-changes)). Everything else an app might want to do around a message is a var, each a list of actions run on the corresponding chat-block event:

| Var                | Event           | For                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `on_before_send`   | `onBeforeSend`  | Refuse a typed send — `Throw` here. It runs in the browser, and welcome prompts, suggestions, regenerate and edit send without it, so a quota or entitlement check must also be enforced where the agent runs.                                                                                                                                                      |
| `on_user_message`  | `onUserMessage` | The app's own record of what was asked. Runs after the module has persisted the thread, so a thread id is already stored by this point.                                                                                                                                                                                                                             |
| `on_data_part`     | `onDataPart`    | Custom data parts the agent streams. Filter on the part type yourself; every part arrives here.                                                                                                                                                                                                                                                                     |
| `on_feedback`      | `onFeedback`    | Ratings from the feedback control.                                                                                                                                                                                                                                                                                                                                  |
| `on_panel_open`    | —               | The `panel` opened, after `enter` has resumed the thread. Runs on every open. The mount-time half of `on_thread_change`: it covers the thread the panel arrives on, which no other seam sees. Panel only — `embedded` has no open moment, so a page using it splices its own actions after `enter`.                                                                 |
| `on_thread_change` | —               | The active thread changed by a user action: a thread opened from the list, a new chat started, or the open thread deleted. Not fired by `enter`, so it does not cover the thread resumed on arrival — see `on_panel_open`. Re-derive anything you render outside the chat from the open conversation; read the new thread from `ai_conversation_id`, not the event. |
| `on_link_click`    | `onLinkClick`   | A link clicked inside a message, as `{ href, text }`. Open an in-app target in place instead of navigating out of the conversation. Wiring it turns interception on for the whole message, so an href you do not recognise navigates nowhere — handle the fall-through. Modified and non-primary clicks are never delivered, so open-in-new-tab keeps working.      |

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

Recording it is only half of it. The chat block persists no rating, so a reload or a
thread switch shows the message unrated again even though the app stored it. Hand back
what you stored through `feedback_values`, keyed by message id and in the block's own
`like`/`dislike` vocabulary.

Rebuild it for the thread being opened, on **both** seams that open one: `on_panel_open`
for the thread the panel resumes on arrival, and `on_thread_change` for every switch
after that. Wiring only the second is the easy mistake — thumbs come back when the user
changes thread and are missing on the one they land on:

```yaml
feedback_values:
  _state: stored_ratings_for_thread
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

## Replies that finish after the page changes

The browser saves the reply when it finishes streaming. A person who moves to another page while the agent is still answering takes the chat with them, so that save never runs. The agent keeps going on the server: set the module's `save-thread-on-finish` endpoint as the agent's `onFinish` hook, and the reply is stored on its thread when the agent finishes, whoever is still watching.

```yaml
# lowdefy.yaml
agents:
  - id: support
    type: AIGatewayAgent
    connectionId: ai_gateway
    properties: { ... }
    hooks:
      onFinish:
        - ai-assistant/save-thread-on-finish # <module entry id>/save-thread-on-finish
```

Lowdefy calls the hook on the server once the stream ends, as the person who sent the message, so it writes only that person's thread. It stores the messages and nothing else: the title, scope and tags stay with the browser's saves. It writes only to a thread the browser has already saved, which it does when the message is sent, so an agent the app also uses outside this module can keep the hook: a conversation that is not one of the module's threads is left alone. The hook adds no `dataParts` to the stream.

Without the hook, a reply the person leaves before it finishes is lost.

**What the person sees.** Each time the panel opens with a thread showing, it re-reads the stored thread, so a reply that finished while they were elsewhere is there without a refresh, and after one. A page with the embedded chat does the same when `enter` runs in its `onMount`, which it needs for this (see [Scope](#scope) for the splice). A thread whose last message is still the person's shows a one-line status above the chat, "The assistant is still replying.", with a **Check again** link that loads it once more. A turn that ended with no answer looks the same: if Check again brings nothing, the person sends their message again.

**Two writers, one history.** The browser's saves and the hook's can land in either order, and the browser may not hold a reply the hook stored, for example when the person reopens the thread and sends again before the reply has landed. So neither write replaces the stored history. Messages are matched by id; the browser sends the ids of every message it has held, and a stored message is dropped only when the browser held it and left it out (deleted, regenerated or edited away). A reply only the server holds is kept, before the browser's next question.

The merge is a read then a write, so two saves to one thread within a few milliseconds of each other can still lose one of them. The two writers are a send and a reply finishing, which a person rarely lines up that closely.

## Requirements

- An app agent whose id is passed as `agent_id`.
- `@lowdefy/modules-mongodb-plugins` — ships the [`FloatingPanel`](../plugins/floating-panel.md) block and the `AiText` connection used for titling.
- Secrets `MONGODB_URI` and (while `generate_titles` is on) `AI_GATEWAY_API_KEY`.
- Under `auth.organizations.policy: tenant` nothing extra: the threads connection is walled like any MongoDB connection, so each organization has its own thread history per (scope, user), and the `AiText` connection holds no data and is declared non-scopable.
- **Protected endpoints.** Lowdefy API endpoints are public unless the app protects them, in its `auth.api` config. Every endpoint here is keyed on the session user and rejects a call with no session, but that is a backstop, not a substitute for app-level auth.
- **Two indexes on the threads collection.** The module does not create them; nothing breaks
  without them until the collection grows, which is the worst time to find out.

  | Index                                           | Serves                                                                                                                                                                                                                                                                                                                          |
  | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `{ scope: 1, user_id: 1, updated: -1 }`         | `list-threads`, which matches on scope and the session user and sorts newest-first. The whole index, in order — a partial one still sorts in memory. Also serves the match stage of `get-active-thread`.                                                                                                                        |
  | `{ conversationId: 1, user_id: 1 }`, **unique** | the other five endpoints: get, save, rename, title and delete all filter on exactly this pair. Unique is not only for speed: `save-thread` upserts on it, and concurrent upserts that both miss will both insert, leaving one conversation stored as two rows. Whichever the query reaches first is then the one the user sees. |

  The thread list is capped at 200 per (scope, user), newest first. The threads view searches client-side over that window, so a user holding more chats than the cap in one scope cannot reach the older ones — an app expecting that needs pagination in `list-threads`, not a larger cap.

  `get-active-thread` sorts on `last_opened` falling back to `updated`, which is a computed
  field and so sorts in memory — over one user's threads in one scope, which is the same
  bounded set the list is capped at.

  A **TTL index** is also worth having where threads should expire — the module stamps
  `updated` on every save, so `{ updated: 1 }` with `expireAfterSeconds` set to your retention
  period expires a thread a fixed time after its last activity, not after its creation.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
