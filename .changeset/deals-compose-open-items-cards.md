---
"@lowdefy/modules-mongodb-deals": patch
---

Replace the single merged open-items card (`components/detail/section_actions.yaml`
+ `components/detail/action_card.yaml.njk`) with the two cards it used to
combine, now composed side by side: the `workflows` module's `open-actions`
and the `activities` module's new `open-tasks`. Deletes the merged card,
its now-dead `open_actions_all`/`open_actions` seeding (`actions/compute_open_actions.yaml`
and all its call sites), the `get_selected_deal_open_actions` request, and
deals' own `actions-collection` connection (its only remaining reader) —
the workflows engine keeps its own, separate actions collection. Task
creation/edit now refetches `open-tasks`' own request instead.
