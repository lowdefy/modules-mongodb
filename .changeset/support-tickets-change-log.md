---
"@lowdefy/modules-mongodb-support": patch
---

Apps that keep each organisation's data apart can now install the support module. Their build failed because the module recorded changes to users' tickets beside each organisation's own change history; it now records them in the shared system change log.
