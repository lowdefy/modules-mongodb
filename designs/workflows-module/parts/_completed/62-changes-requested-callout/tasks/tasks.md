# Implementation Tasks — Part 62: Changes-requested comment callout

## Overview

These tasks implement Part 62: surfacing the reviewer's `request_changes` comment as a read-only `Alert` callout in the action workspace's bare-alerts slot, shown only while the action is in the `changes-required` stage. The comment is read from the latest `action-request_changes` event inside the `GetWorkflowAction` envelope (app-scoped for free via Part 61), rendered as a `type: warning` Alert below the `workflow_closed_banner` and above the Part-64 content card. The request-changes comment input is also hardened to text-only so the callout never has to render an attachment. Derives from `designs/workflows-module/parts/62-changes-requested-callout/design.md`.

## Tasks

| #   | File                               | Summary                                                                                                                           | Depends On |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-envelope-changes-requested.md` | Expose `changes_requested` on the `GetWorkflowAction` envelope (gated events read) + declare `eventsCollection` in schema + tests | —          |
| 2   | `02-callout-fragment.md`           | Author the new `changes-requested-callout.yaml` Alert fragment                                                                    | —          |
| 3   | `03-wire-templates.md`             | `_ref` the callout fragment into the bare-alerts slot of all five action templates                                                | 1, 2       |
| 4   | `04-text-only-comment-input.md`    | Block inline files on the request-changes comment inputs + simplify their `validate`                                              | —          |
| 5   | `05-docs-indexes.md`               | Document the `{ action_ids: 1 }` events-collection index in `indexes.md`                                                          | —          |

## Ordering Rationale

- **Task 1** is the server-side foundation: it exposes the `changes_requested` field on the envelope that every template binds to, and declares the `eventsCollection` schema field the read consumes. Nothing about the rendered callout works until this field exists. It is self-contained (server-only, no build impact) and ships with its own unit tests.
- **Task 2** authors the reusable Alert fragment once (the "one correct way" / no-5-way-drift requirement of D2). File-wise it depends on nothing, but it has no effect until wired (Task 3) and binds the field from Task 1.
- **Task 3** wires the fragment into all five templates' bare-alerts slots. It needs both the field (Task 1) and the fragment (Task 2), so it sits last in the render chain.
- **Task 4** (text-only comment input) and **Task 5** (docs) are independent of the render chain and of each other — they can run in parallel with Tasks 1–3. Task 4 is the input-side guarantee behind decision D3 (a stored comment is always text); Task 5 documents the index the Task 1 read expects.

**Parallelism:** Tasks 1, 2, 4, and 5 can all be started independently. Only Task 3 must wait (on 1 and 2).

## Scope

**Source:** `designs/workflows-module/parts/62-changes-requested-callout/design.md`
**Context files considered:** `designs/workflows-module/parts/64-action-description/design.md` (the layout model Part 62 slots into — bare-alerts slot, content card, `action-description.yaml`); `docs/workflows/index.md`; `docs/workflows/reference/indexes.md`. No other supporting `.md` files exist in the Part 62 design folder.
**Review files skipped:** `review/` (subfolder present, ignored per skill instructions).
