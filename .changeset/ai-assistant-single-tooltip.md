---
"@lowdefy/modules-mongodb-ai-assistant": patch
---

ai-assistant: one tooltip per toolbar button

- Fix the double tooltip on the embedded toolbar's icon-only buttons. `toolbar.icon_only` wrapped each button in a tooltip, but the Button already shows its title as a tooltip when the title is hidden, so each showed twice.
- The toolbar icons in both the panel and the embedded shell no longer show a browser tooltip naming the icon ("Outline Plus").
