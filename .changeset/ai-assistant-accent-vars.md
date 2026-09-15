---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-plugins": minor
---

ai-assistant: let an app colour the chat where it currently inherits antd's primary

Three surfaces took their colour from `--ant-color-primary*` with no way to change it: the
selected chat in the thread list, the embedded toolbar's buttons, and the assistant's name chip
in the docked panel. That is right where the app's primary IS its accent, and wrong where it is
a neutral — an app with a grey `colorPrimary` gets a grey selected chat that looks hovered, and
a grey name chip on a grey tint, which is the one thing that chip exists to avoid. Nothing an
app could write in its own stylesheet fixed it: the thread list's selected class is generated,
and the panel's chip rule lands at the same specificity a consumer can reach, so the two tie
and the plugin wins on order.

- `thread_selection` — `{ border, background }` for the selected chat.
- `toolbar` — `{ size, accent, accent_text, secondary }` for the embedded shell's toolbar: the
  antd button size, the fill marking the primary action, and the fill behind the rest.
- `--fp-role-assistant-bg` / `--fp-role-assistant-fg` — CSS custom properties the FloatingPanel
  stylesheet now reads for the assistant's name chip.

The chat title's size is also pinned to 1rem. `level: 5` asked for a semantic heading, so the
title took whatever the consuming app decided `h5` means — an app that styles h5 as metadata,
which is a common choice, rendered the chat title at secondary-text size. A consumer that had
deliberately sized the title through `h5` will now see 1rem instead.

Decisions:

- Every default is today's value, so no existing consumer changes appearance. `toolbar.size`
  stays `small` for the same reason, even though 24px is slight for what are the shell's
  primary actions — an app that wants bigger now says so.
- `toolbar` covers the embedded shell only. The panel's buttons are icon-only in a 420px
  column, where `small` is right and a fill would read as chrome rather than as an action.
- The toolbar fills are set on the blocks via their `.element` css key rather than left to a
  consumer stylesheet. Reaching those buttons from outside means selecting on module-internal
  block ids, which a release can rename with nothing raising an error on the consumer's side.
- The panel chip uses CSS custom properties rather than a var, because the rule lives in the
  plugin's stylesheet and never passes through the module's var resolution.
