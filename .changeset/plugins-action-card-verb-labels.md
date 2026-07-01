---
"@lowdefy/modules-mongodb-plugins": patch
---

**Action-card verb-default button labels** — the collapsed action link is now stamped with a label that names the action the _resolved verb_ performs: `edit → Complete`, `review → Review`, `error → Resolve`, `view → View`. So a view-only user on an `action-required` action reads "View", not "Complete". Previously every card fell back to the `EventsTimeline` default "View".

An author-provided `title` on a custom-action `link:` / `view_link:` cell (or a tracker `start_link`) is preserved through `resolveCellLink` and wins over the verb default. Documented in `docs/workflows/how-to/custom-actions.md` (§ The action card button label) and `docs/plugins/events-timeline.md`.
