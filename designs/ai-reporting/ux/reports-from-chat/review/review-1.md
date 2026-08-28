# Review 1 — reports-from-chat

Critique of `designs/ai-reporting/ux/reports-from-chat/design.md` and its tasks. Findings ranked most-structural first.

## 1. The separate `list-conversation-reports` endpoint fights "one correct way"

> **Resolved.** Folded the read into `get-conversation-results`: it gains a `reports-store` find step and a `saved_reports` return field; the page's existing `set_results` `SetState` picks it up — no new endpoint, export, or `CallAPI`. Rewrote the "Fold the read…" decision, endpoints table, files list, resolved-question 3, and risks; retitled and rewrote task 1; updated tasks 2 and the tasks index; renamed the task file to `01-fold-read-into-get-conversation-results.md`.

The design adds a new endpoint `list-conversation-reports` plus a second `CallAPI` + `SetState` in `conversations.onSelect`, on top of the existing `get-conversation-results` call. But `get-conversation-results` is already _the_ per-conversation load endpoint for the panel: owner-scoped, fired on the same `onSelect`, returning `messages` + `charts` + `tables` + `downloads`. Saved reports are one more thing the results panel shows for a conversation.

Verified: `get-conversation-results` has exactly **one** caller (chat.yaml `onSelect`, no hook). Folding the saved-reports read into it as a second step (a `MongoDBFind` on `reports-store`, returned as `saved_reports`) is strictly smaller and more correct: it deletes a file, an export, a `CallAPI` and a `SetState`; it removes the drift risk of a second fetch each load site must remember to fire; and it costs no extra call frequency.

The design's resolved-question 3 rejected folding on three grounds that don't hold: "different store" (same DB, same module, both connections already wired), "hot path" (identical frequency — one _fewer_ call folded), and "mixes concerns" (the endpoint is literally `…-results`; saved reports are results-panel content).

**Proposed resolution:** fold the read into `get-conversation-results`; drop task 1's separate endpoint and task 2's extra `CallAPI`/`SetState`; rewrite resolved-question 3.

## 2. Latent gap the separate endpoint would create: restore-on-mount

> **Resolved.** Subsumed by #1. Folding the read into `get-conversation-results` closes the restore-on-mount gap — a future "Open source chat" deep-link that restores a conversation on mount inherits `saved_reports` through the same load. Reasoning captured in the "Fold the read…" decision and resolved-question 3.

Today `onSelect` is the only path that loads a conversation (verified: `onInit` always mints a fresh `conversationId`; the chat page reads no `urlQuery`), so `onSelect`-only refetch is complete _now_. But the save-as-report design already posits a report→chat **"Open source chat"** deep-link. When that lands — chat restoring a conversation from the URL on mount — a _separate_ `list-conversation-reports` is silently missed unless that future task remembers to also call it. Folding into `get-conversation-results` (finding 1) closes this for free, because the restore path must call it to load the transcript.

Largely a consequence of finding 1: resolving 1 by folding resolves this too. If finding 1 is _not_ folded, this becomes a standalone concern (the design must plan the restore-path refetch).

**Proposed resolution:** subsumed by finding 1 (fold). Otherwise, note the restore-path refetch as an explicit future dependency.

## 3. The re-visit reframing narrows the value the user picked B for

> **Resolved (expand scope).** User chose instant-on-save on both routes. Verified first that a tool endpoint can't receive `conversationId` (external agent framework — same blocker class as the rail block), so the naive "tool sets it" path is out; the turn-end `emit-data-parts` hook is the seam. **Save sheet:** drop its post-save `Link` navigation, refresh `saved_reports` via `get-conversation-results` (task 3). **Agent path:** `emit-data-parts` backfills `conversation_id` (owner-guarded `FindOneAndUpdate`) and emits a `data-report-saved` part — streamed, not persisted — appended by a new `onDataPart` branch (tasks 2, 4). Rewrote the instant-on-save decision, added the agent-route decision, endpoints table (+`emit-data-parts`), files, RQ1/1b/2, deviations, non-goals, risks; restructured tasks into five (added 03 save-sheet, 04 agent-path); parent two-axis inventory + save-as-report flow note in task 5.

The design correctly establishes that the save flow navigates to the report page, so "appears the moment you save" (the wireframe promise B was chosen on) is gone, and reframes the feature as re-visit-only. This matches the literal ask ("if I'm on a chat, see its reports"), but its payoff now depends entirely on how often users reopen older chats — a product call worth an explicit confirmation rather than a buried resolved-question. If instant-on-save actually matters, the honest alternative is a small save-sheet change (soften the navigate), which the design under-weighted.

**Proposed resolution:** product decision by the user — accept re-visit-only, or open the save-flow change as scope.

## 4. The "saved …" row timestamp uses `updated`, not `created`

> **Resolved.** Switched the row's timestamp and the read's sort to `created` (the save time), so a later rename/republish never restates when a report was saved. Updated the folded read's projection + sort (task 1) to `created`/`created.timestamp: -1`, the row's saved-when (task 2), the returned/part row shape, and the design's "card that navigates" decision and endpoints table. The live `data-report-saved` part already carried `created`, so all sources now agree.

The section sorts by `updated.timestamp` desc (fine) but labels the row timestamp "saved," which is the _created_ moment. A report later renamed or republished would show a misleading "saved 2m ago." Fix: label by `created` for "saved," or relabel the field "updated." Return whichever the row shows.

**Proposed resolution:** small — pick `created`-as-"saved" or relabel; update task 1's projection and task 2's row.
