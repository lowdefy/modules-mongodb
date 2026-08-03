---
"@lowdefy/modules-mongodb-plugins": patch
---

`WorkflowProgress`'s action buttons are smaller — 12px text with 4px/10px padding, about 26px tall where they were 31px. They sit under each action group's label, so a workflow with several groups spends most of its height on them, and the extra bulk bought nothing.

This applies everywhere the block renders, not just the deals workspace. Consumers wanting a different size can style the `button` cssKey rather than carry a fork.
