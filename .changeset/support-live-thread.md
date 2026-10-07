---
"@lowdefy/modules-mongodb-support": minor
"@lowdefy/modules-mongodb-layout": minor
---

The `support` module's open thread is live. The module ships a `ticket-thread` websocket, a change stream on `support-tickets` filtered to the open ticket and the signed-in user, and a `subscriptions` component for the layout's new `global_subscriptions` var. Opening a thread subscribes; going back to the list, switching views or closing the panel unsubscribes, so only people chatting hold a stream. A change replaces the thread with the stored row and marks a newer view read. The `support` page declares the same subscription itself.

The `layout` module takes `global_subscriptions`, subscriptions declared on every page, and the `page` component takes `subscriptions`, a page's own. A page that subscribes to a websocket `global_subscriptions` also names keeps its own, so it holds one channel.
