---
"@lowdefy/modules-mongodb-plugins": minor
---

**New `SupportScreenshot` block.** A Take screenshot button that draws the visible page to a PNG from its DOM (no browser permission prompt), with every password input, every `[data-support-mask]` element and every `maskSelectors` match drawn as a solid box, and `hideSelectors` left out. The user can blur or crop the result before it is uploaded through an S3 presigned POST policy request; `onUse` fires with the uploaded file only after S3 stores it. The page itself is left as it was. See `docs/plugins/support-screenshot.md`. Adds `modern-screenshot` as a dependency.
