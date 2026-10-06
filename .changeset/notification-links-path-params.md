---
"@lowdefy/modules-mongodb-notifications": minor
---

A notification link can carry `pathParams` next to `urlQuery`, for a page that declares a path such as `items/{id}`. The link page opened from an email, and the inbox popup's View button, now pass the stored link's `pathParams` to `Link`; a link without `pathParams` behaves as before. This needs a Lowdefy release whose `Link` action accepts `pathParams`.
