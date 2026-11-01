---
title: FileDownload
module: plugins
type: reference
---

# FileDownload

A list of files, each a plain link to a link endpoint (an `Api` endpoint with `link: true`). The link is `<basePath>/api/endpoints/<linkEndpointId>/<...linkPath>/<key>`. It opens in a new tab, can be copied, and checks access every time it is opened: the endpoint loads the record the file belongs to, checks the caller may see it, and answers 302 to a short-lived signed link. A key in the browser is never enough to open a file, and the block itself fetches nothing.

EventsTimeline, DataDescriptions and SmartDescriptions render it inside themselves for their file values, and FileManager builds the same links for its own rows.

## Usage

```yaml
- id: lot_files
  type: FileDownload
  properties:
    linkEndpointId:
      _module.endpointId:
        id: file
        module: files
    fileList:
      _state: lot.files
```

A file from the `files` module's `list-files` is a record, and its key is its `_id`. A workflow form file has no record, so the `form-file` endpoint finds it in the workflow named by `linkPath`:

```yaml
- id: form_files
  type: FileDownload
  properties:
    linkEndpointId:
      _module.endpointId:
        id: form-file
        module: workflows
    linkPath:
      - _state: workflow._id
    fileList:
      _state: workflow.form_data.attachments.fileList
```

## Properties

| Property         | Type   | Default | Description                                                                                                                             |
| ---------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `linkEndpointId` | string | —       | Required. Id of a link endpoint that redirects `GET /api/endpoints/<linkEndpointId>/<...linkPath>/<key>` to the file.                   |
| `linkPath`       | array  | —       | Path segments that go before the key, such as `[workflow_id]`. Each is one encoded segment.                                             |
| `fileList`       | array  | `[]`    | The files to list, each `{ _id?, key?, name, size?, type? }`. The link names the file's `_id`, else its `key`. `name` is the link text. |

## The link

The app's base path comes first, so links work on an app that sets one. Each `linkPath` entry is encoded as one segment. The key is encoded segment by segment and keeps its own `/` as path separators, so a space, `+` or `&` in a file name reaches the endpoint unchanged. A link has no host, so it works on every domain the app is served on, and each domain checks its own session.

## The endpoint

A link endpoint gets `{ path, query }` as its payload and returns the URL to redirect to. The `files` module's [`file`](../files/reference/endpoints.md) and the workflows module's [`form-file`](../workflows/reference/exports.md) are two. They answer a signed-out open with 401 and every refusal with a bare 404, which a new tab shows as the browser's own status page; the endpoint's message is not shown.

An app that signs its own files for these blocks writes a `link: true` endpoint that loads the file, checks access and returns the signed URL.
