---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-workflows": minor
---

**Feature:** the action workspace now surfaces the reviewer's request-changes comment as a read-only callout while an action is in `changes-required` (Part 62). The callout sits in the middle column's bare-alerts slot — below the `workflow_closed_banner`, above the content card — as a `type: warning` Alert ("Changes requested" + the comment), so the reworker sees the "what to fix" brief without hunting the History timeline.

The brief is resolved server-side in the `GetWorkflowAction` envelope as a new `changes_requested` field: a single gated read of the latest `action-request_changes` event (`sort date desc, limit 1`), projecting the calling app's `{app_name}.description` bucket. App-scoping is inherited from the multi-app comment-visibility model for free — an `internal` reviewer note resolves to `null` for an app that can't see it; the read is skipped (and `null`) in every other stage. Empty/whitespace-only HTML normalizes to `null` so the callout never renders blank. The Alert sanitizes the comment HTML at render (`renderHtml` → DOMPurify).

The WorkflowAPI connection now declares `eventsCollection` (string, default `"log-events"`), and the request-changes comment inputs are now text-only (inline image uploads disabled), so the callout only ever renders a text brief.

Host apps in a multi-app deployment must add a `{ action_ids: 1 }` index to the events collection (`log-events`) — see the workflows Indexes reference.
