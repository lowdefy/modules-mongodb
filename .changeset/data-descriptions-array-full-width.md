---
"@lowdefy/modules-mongodb-plugins": patch
---

`DataDescriptions` now renders array-valued fields (tag clouds, collapsible lists) on their own full-width row. In a multi-column layout an array's wide content used to share a row with a scalar field and steal its width, collapsing the scalar's cell until its text broke mid-word. Array fields now behave like the other full-width types (rich text, long text, location) and never squeeze a sibling.
