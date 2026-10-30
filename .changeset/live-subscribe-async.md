---
"@lowdefy/modules-mongodb-notifications": patch
---

**A live feed that fails to subscribe no longer stops the page loading.** The layout page component subscribes to the `notifications-live` websocket at the start of each page's `onMountAsync`. When the subscribe failed (for example a host answering every websocket upgrade with a 502), it ended the chain about 10 seconds later: the popups fetch and the page's own `events.onMountAsync` steps never ran, so data fetched there never loaded. The subscribe now runs async, so the page's steps run at once whether it succeeds or not. A failure still goes to the browser console and the client-error report, and shows the user no error toast.

The live feed needs a host that serves websockets: on Vercel, turn on Fluid Compute for the project. Set the notifications module's `live: false` only on a host that can't run websockets. Nothing to change to upgrade; upgrade every module and `@lowdefy/modules-mongodb-plugins` together, as always.
