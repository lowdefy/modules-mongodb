---
"@lowdefy/modules-mongodb-workflows": minor
---

**New `form-file` link endpoint, and rich-text images are private.** A `GET` on `/api/endpoints/<workflows entry>/form-file/<workflow_id>/<key>` finds the key in the form slots of actions the caller may view, under the same rules as `download-form-file`, and answers `302` to an S3 link signed for 60 seconds. Images and PDFs open in the browser; every other type downloads. A signed-out caller gets `401`, and every refusal a `404` with no body. Needs Lowdefy 7.2.0 or later. `download-form-file` is unchanged.

Images pasted into a `tiptap_input` field are now saved as this `form-file` link instead of an S3 URL, so they load only for people who may view that action, and the app's bucket can stay private. The saved HTML holds the app's base path and the workflows entry id, so apps that share workflow data must use the same base path and the same entry id for the workflows module. Images saved before the upgrade keep their S3 URLs and load only while the bucket serves them; rewrite them in your app if you need them private.
