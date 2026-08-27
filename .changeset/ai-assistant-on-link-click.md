---
"@lowdefy/modules-mongodb-ai-assistant": minor
"@lowdefy/modules-mongodb-plugins": patch
---

ai-assistant: add an `on_link_click` var, and soften the selected-thread highlight

A link in an answer was a plain anchor, so following a citation was a full browser
navigation out of the conversation with no way for an app to show the target in
place. `AgentChat` now carries an `onLinkClick` event, and this exposes it as the
`on_link_click` seam alongside `on_before_send`, `on_user_message`, `on_data_part`
and `on_feedback`. The event gives you `href` and `text`.

It is wired only when you supply actions. The block decides whether to intercept a
click from the event's presence, and an event declared with an empty action array is
still present — so passing the var through unconditionally would suppress every
anchor in every consuming app and then run nothing. Wiring nothing changes nothing.

Two things to know once you do wire it: an href you do not recognise navigates
nowhere, because interception covers the whole message, so handle the fall-through;
and modified or non-primary clicks are never delivered, so open-in-new-tab keeps
working.

The manage-chats list also passes its own `.selected` style now. `ListSelector`
defaults to a primary border plus a `0 0 0 1px` primary ring, and a box-shadow ring
keeps the radius it is given rather than growing to stay concentric — so the two
curves fell out of phase and every corner rendered thick and faceted. It is now one
soft primary border over a tinted fill, from theme tokens, so it follows dark mode
and your own primary colour.

Also widens the plugin package's Lowdefy peer range to accept
`0.0.0-experimental-20260827105525`, the first published build carrying the event.
