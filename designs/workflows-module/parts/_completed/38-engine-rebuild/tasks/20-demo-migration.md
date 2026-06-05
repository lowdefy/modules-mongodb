# Task 20: Demo migration — superseded

Superseded by [Part 45 — demo rebuild](../../../45-demo-rebuild/design.md): the demo `workflow_config` is deleted and re-authored from scratch in the post-rebuild grammar, not migrated in place. Implement Part 45 instead; it also absorbs this task's non-config concerns: the notification policy lands as Part 45 item 9, and the per-verb `action_allowed` consumers are all module-owned (migrated by Part 38's own template work — no app-side consumers exist) — Part 45's per-verb `access` config (items 1–2) and role-gated e2e step (item 10) exercise them.

Landing order: Part 38 tasks 1–19 → [Part 43](../../../43-rename-simple-kind-to-check/design.md) → [Part 44](../../../44-tracker-start-link/design.md) → Part 45.
