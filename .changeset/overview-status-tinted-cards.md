---
"@lowdefy/modules-mongodb-workflows": minor
---

Workflow and action-group overview pages: each action card now reads at a glance. The card header is tinted with its status colour and the status badge picks up the same pale-fill/outline/saturated-text treatment as the workflow status pill above it, so a long list of collapsed actions can be scanned without opening anything. The action message is emphasised, the link button carries a right-arrow, and a collapsed card is now just its coloured header instead of a header plus an empty white body.

Uploaded files inside an action's data now download instead of showing "No files available" — both pages wire the files module's download policy.

The title bar now states which record the workflow belongs to: a new line beneath the title shows the entity's id, linked straight to its record. Expand/collapse-all has moved into the title bar's actions area, freeing the row it used to occupy above the cards, and reads as a button rather than plain text. The group heading's icon is also aligned with its title rather than sitting above it.
