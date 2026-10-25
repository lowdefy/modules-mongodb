---
"@lowdefy/modules-mongodb-notifications": minor
---

**Sign-in tokens go out in the email and are never stored.** An item may carry `sign_in_tokens` (`{ name: token }`), the tokens its template appends to its links. Dispatch renders and sends the email with them, but the notification record keeps the item without `sign_in_tokens`, and its stored body, text and preview have every token cut out of their links. Reading the collection, or opening the notification in the inbox, never gives a usable token. A drain retry sends the stored body, so its links go through the ordinary sign-in.
