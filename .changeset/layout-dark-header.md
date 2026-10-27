---
"@lowdefy/modules-mongodb-layout": minor
---

Module pages can now have a dark header, to match an app whose own pages draw one. On the layout module, set `header: { theme: dark, style: { background: <colour> } }`. Every page with `page_type: header-menu` then gets the public folder's dark logo variants (`logo-dark-theme.png`, `logo-square-dark-theme.png`), a dark menu, light header icons, and the header style you pass. Set antd's `Menu` `darkItemBg` and `darkPopupBg` tokens in your theme to the same colour, or the menu shows antd's default navy.

The `header` var was declared before but did nothing, so apps that don't set it see no change. `sider-menu` and `sidebar` pages ignore it.
