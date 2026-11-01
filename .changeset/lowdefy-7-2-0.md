---
"@lowdefy/modules-mongodb-ai-reporting": major
"@lowdefy/modules-mongodb-plugins": major
---

**Breaking: v2 needs Lowdefy 7.2.0 or later.** The plugins package now peers on `@lowdefy/block-utils`, `blocks-antd`, `blocks-basic`, `helpers` and `nunjucks` `^7.2.0`, the first release with link endpoints (`type: Api`, `link: true`) and Tiptap's `imageSrc`. Set `lowdefy: 7.2.0` in `lowdefy.yaml` and move your `lowdefy` and `@lowdefy/*` packages to 7.2.0. The ai-reporting module pins `@lowdefy/connection-ai-gateway` 7.2.0.
