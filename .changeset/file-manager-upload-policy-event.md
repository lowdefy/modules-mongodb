---
"@lowdefy/modules-mongodb-plugins": minor
---

FileManager can take its upload policy from the page's own actions instead of a page request.

When a page defines the new `onUploadPolicy` event, the block triggers it before each upload in place of the `s3PostPolicyRequestId` request, with `_event` set to `{ file, pasted }`. The actions fetch the policy (for example from an API endpoint that checks permissions and picks the key on the server) and hand it back with the new `setUploadPolicy` method. If the event ends without a policy, the block drops the upload quietly, with no error state, so the page can show its own message. A file pasted from the clipboard carries `pasted: true` in the policy event and on `onSave`'s `file`. Apps that set `s3PostPolicyRequestId` and define no `onUploadPolicy` behave as before.
