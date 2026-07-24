---
"@lowdefy/modules-mongodb-workflows": minor
---

Workflow and action-group overview pages: the back arrow now returns to the previous page instead of always jumping to the entity view (the entity stays reachable via the breadcrumb), and each action is individually collapsible with an Expand/Collapse-all toggle, all collapsed by default.

Adds two per-action options: `show_comment` (default `true`) — set `false` to hide the free-form comment box on an action's edit and review pages; and `pages.edit.validate_on_draft` (default `false`) — set `true` to validate the form (like Submit) before the edit page's Save Draft saves.
