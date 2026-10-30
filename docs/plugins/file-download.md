---
title: FileDownload
module: plugins
type: reference
---

# FileDownload

A list of files that downloads each one through an API endpoint. On click it calls the endpoint named by `downloadEndpointId` with `{ ...downloadPayload, file_id }` and opens the `url` it returns. The endpoint loads the record the file belongs to, checks the caller may see it, and signs that record's key, so a key in the browser is never enough to download a file.

EventsTimeline, DataDescriptions and SmartDescriptions render it inside themselves for their file values, and FileManager calls the same endpoint for its own download button.

## Usage

```yaml
- id: lot_files
  type: FileDownload
  properties:
    downloadEndpointId:
      _module.endpointId:
        id: download-file
        module: files
    fileList:
      _state: lot.files
```

A file from the `files` module's `list-files` is a record, so `file_id` is its `_id`. A file with no record (a workflow form file) is sent by its `key`, and the endpoint finds it from `downloadPayload`:

```yaml
- id: form_files
  type: FileDownload
  properties:
    downloadEndpointId:
      _module.endpointId:
        id: download-form-file
        module: workflows
    downloadPayload:
      workflow_id:
        _state: workflow._id
    fileList:
      _state: workflow.form_data.attachments.fileList
```

## Properties

| Property             | Type   | Default | Description                                                                                                                                    |
| -------------------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `downloadEndpointId` | string | —       | Required. Id of an API endpoint that takes `{ file_id, ...downloadPayload }` and returns `{ url }`, a signed link to that file.                |
| `downloadPayload`    | object | —       | Extra fields sent with each download, such as `{ workflow_id }`. `file_id` is always set from the clicked file, over any `file_id` given here. |
| `fileList`           | array  | `[]`    | The files to list, each `{ _id?, key?, name, size?, type? }`. `file_id` is the file's `_id`, else its `key`. `name` is shown in the list.      |

## The endpoint

The endpoint returns `{ url }`. To refuse a download it fails, for example with `:reject:` and a message: the block shows that message and opens nothing. The `files` module's [`download-file`](../files/reference/endpoints.md) is one such endpoint.

## Notes

- **Cold loads.** The block runs a `CallAPI` action that reads `_event`, which it registers itself. Its meta declares both, so a page whose own config uses neither still loads them. Blocks that embed it (FileManager, EventsTimeline, DataDescriptions, SmartDescriptions) declare them too.
- **Internal event.** The block registers `__getDownloadPolicy` for its own use. Do not bind to this name in consumer YAML.
- **Payload at click time.** `downloadPayload` is read when the file is clicked, so a payload that resolves after the page loads (a record fetched later) is current.
