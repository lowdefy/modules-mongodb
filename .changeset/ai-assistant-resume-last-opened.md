---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

ai-assistant: resume the thread you last opened, and add an `on_thread_change` seam

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
