---
"@lowdefy/modules-mongodb-workflows": patch
---

**Action fields header polish (Part 67)** — the universal-fields chips row is relabelled and restructured into a labelled two-field strip: an **Assignees** list (with `Unassigned` / `+N` overflow states, each assignee's avatar linking to the contact) and a due-aware pill (`No due date` placeholder, overdue styling). The templates and `check-action-surface` now pass `assignee_docs` as a path string and expose the action's `stage` leaf to the header. `contacts` becomes a build-time dependency of the always-present chips (for the avatar link).
