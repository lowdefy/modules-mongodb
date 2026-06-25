---
"@lowdefy/modules-mongodb-workflows": patch
---

Migrate the `box` and `section` form field components off the deprecated `layout.contentGutter` / `layout.contentJustify` props to `layout.gap` / `layout.justify`. The build treats these deprecation warnings as fatal, so any action `form:` using `box` or `section` failed to build.
