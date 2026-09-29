---
"@lowdefy/modules-mongodb-layout": patch
---

The optional `menu`, `sider.*` and `logo.style` vars declare an explicit `default: null`. Behaviour is unchanged: an unset var already resolved to null.
