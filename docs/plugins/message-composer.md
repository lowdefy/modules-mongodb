---
title: MessageComposer
module: plugins
type: reference
concepts: [composer, attachments, s3-upload]
---

# MessageComposer

A message box in one bordered frame: a text area that grows with the text, the files attached to the message as small removable chips, and a bottom bar with an attach button, a muted hint (`Markdown · Cmd Enter to send`) and a primary send button. It backs the reply composer and the report form of the `support` module.

- **Send:** the button, or Ctrl or Cmd with Enter. It is disabled while the text is empty or an upload runs, and shows loading while `loading` is true.
- **Attach:** the attach button, paste (Ctrl or Cmd V, with an image on the clipboard) or a file dropped on the box. Only images and PDFs are taken, `maxFiles` (5) at most, `maxSize` (10 MB) each. A pasted image is named `pasted-YYYYMMDD-HHmmss.png`. A paste that carries text is treated as text.
- **Upload:** each file goes to the bucket as it is added, through the S3 presigned POST policy request named in `s3PostPolicyRequestId`, exactly as [FileManager](file-manager.md) does it. Its chip shows a thumbnail (or an icon for a PDF), progress while it uploads and the reason when it fails or is refused. Every chip has a remove button.
- **Theming:** all colours are antd tokens, so light and dark both hold.

The block's value is the message text. It does not keep the stored files: the page does, from `onUploaded` and `onRemove`, and hands them back in `files`.

## Usage

```yaml
- id: reply.message
  type: MessageComposer
  required: true
  properties:
    placeholder: Write a reply
    maxLength: 4000
    s3PostPolicyRequestId: reply_upload_policy
    files:
      _if_none:
        - _state: reply.files
        - []
    loading:
      _state: sending
  events:
    onUploaded:
      - id: add_file
        type: SetState
        params:
          reply.files:
            _event: files
    onRemove:
      - id: remove_file
        type: SetState
        params:
          reply.files:
            _event: files
    onError:
      - id: show_error
        type: SetState
        params:
          reply_error:
            _event: message
    onSubmit:
      - id: send
        type: CallAPI
        params:
          endpointId: post-message
          payload:
            message:
              _event: message
            files:
              _event: files
```

The policy request is a page request, as FileManager takes it, and runs with `_event: file` = `{ name, size, type, lastModified, uid }`. A refused post (over the policy's size cap, an expired policy) is an upload error.

## Properties

| Property                | Type    | Default           | Description                                                                          |
| ----------------------- | ------- | ----------------- | ------------------------------------------------------------------------------------ |
| `placeholder`           | string  | none              | The text area's placeholder.                                                         |
| `maxLength`             | integer | none              | The most characters the message takes.                                               |
| `minRows`               | integer | `2`               | The height, in rows, when empty.                                                     |
| `maxRows`               | integer | `8`               | The rows it grows to before it scrolls.                                              |
| `s3PostPolicyRequestId` | string  | none              | The request that returns the S3 presigned POST policy for an upload.                 |
| `files`                 | array   | `[]`              | The files attached so far, `{ key, name, size, type }` each.                         |
| `accept`                | string  | `"image/*,.pdf"`  | The attach button's file filter. Only images and PDFs are taken whatever this says.  |
| `maxFiles`              | integer | `5`               | The most files that can be attached.                                                 |
| `maxSize`               | integer | `10485760`        | The largest file, in bytes. Cap it in the policy too.                                |
| `hint`                  | string  | `"Markdown"`      | The muted text before the send shortcut.                                             |
| `submitHint`            | boolean | `true`            | Show the send shortcut after the hint.                                               |
| `submitLabel`           | string  | `"Send"`          | The send button's text.                                                              |
| `loading`               | boolean | `false`           | Show the send button loading and refuse a second send.                               |
| `disabled`              | boolean | `false`           | Disable typing, attaching and sending.                                               |

## Events

| Event        | Fires                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `onChange`   | When the text changes.                                                                         |
| `onSubmit`   | On send. `_event = { message, files }`. Not fired while the text is empty or an upload runs.   |
| `onUploaded` | When a file is stored. `_event = { file, files }`, the new file last in `files`.               |
| `onRemove`   | When the user removes a file. `_event = { file, files }`, `files` being what is left.          |
| `onError`    | When a file is refused or its upload fails. `_event = { message, file }`.                      |

## Style keys

`element` (the box), `textarea`, `files` (the chip row) and `bar` (the bottom bar).
