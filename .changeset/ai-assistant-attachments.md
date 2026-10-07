---
"@lowdefy/modules-mongodb-ai-assistant": minor
---

ai-assistant: attachments in the chat, with stored file links signed again on open

`sender_attachments` turns on file attachments in the composer. It is passed through as the chat block's `sender.attachments`, naming the app's own upload and download requests. Null, the default, leaves attachments off.

A file part keeps the link signed at upload, which stops working within days, so a thread reopened later sent the model dead links. `file_links_endpoint` names an app endpoint that signs new ones: when a thread is opened or resumed, the module collects the file parts that carry a storage key and calls it once with `{ files: [{ key, filename, mediaType }] }`. It returns `{ files: [{ key, url }] }`. Each part takes its key's new link, and a key returned with no url keeps the stored link. The storage key on a file part needs a Lowdefy version whose `AgentChat` keeps it at `providerMetadata.lowdefy.key`.
