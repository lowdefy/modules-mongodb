---
"@lowdefy/modules-mongodb-support": patch
---

My tickets is centred on wide screens, and its rows keep their columns in line. The page passes `content_width: 960` to the layout page, so the title, filters and list sit in a centred 960px column rather than against the left edge. In each row the timestamp has a 128px right-aligned column, so "a few seconds ago" no longer runs into the row border, and the type, stage and organisation columns have fixed widths, truncating long values. Nothing to change in your app.
