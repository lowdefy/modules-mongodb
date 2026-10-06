---
title: SupportScreenshot
module: plugins
type: reference
concepts: [screenshot, masking]
---

# SupportScreenshot

A **Take screenshot** button that draws the visible part of the page to a PNG, lets the user blur or crop it, and uploads it to the app's files bucket. It draws the page's DOM with [modern-screenshot](https://github.com/qq15725/modern-screenshot), so there is no browser permission prompt and no screen picker. Backs the `support` module's report form, which passes its own panel in `hideSelectors`.

Three behaviours worth knowing:

- **Passwords and marked fields never reach the image.** Before the page is drawn, every `input[type="password"]`, every element carrying a `data-support-mask` attribute and every match of `maskSelectors` is replaced in the drawing by a solid grey box the size of the element: its text, value, children and background are not drawn. An invalid selector fails the capture rather than letting something through unmasked.
- **The page itself does not change.** The masking and hiding happen on the copy that is drawn. The live page only carries marker attributes while the capture runs, removed again when it ends or fails.
- **What the user sees is what is drawn.** The capture is the viewport at the current scroll position, at the device pixel ratio (at most 2). Fixed and sticky elements, such as a side menu, are drawn where they show on screen.

## Usage

```yaml
- id: report_screenshot
  type: SupportScreenshot
  properties:
    s3PostPolicyRequestId: screenshot_upload_policy
    hideSelectors:
      - .support-panel
    maskSelectors:
      - .customer-card .account-number
  events:
    onUse:
      - id: add_screenshot
        type: SetState
        params:
          report.files:
            _array.concat:
              - _if_none:
                  - _state: report.files
                  - []
              - - _event: file
    onError:
      - id: screenshot_failed
        type: DisplayMessage
        params:
          status: error
          content:
            _event: message
```

The policy request is a page request, as [FileManager](file-manager.md) takes it. It runs with `_event: file` = `{ name, size, type, lastModified, uid }`:

```yaml
requests:
  - id: screenshot_upload_policy
    type: AwsS3PresignedPostPolicy
    connectionId: files/files-bucket
    payload:
      name:
        _event: file.name
    properties:
      key:
        _string.concat:
          - support/
          - _user: id
          - /
          - _uuid: true
          - /
          - _payload: name
      fields:
        Content-Type: image/png
      conditions:
        - - content-length-range
          - 1
          - 10485760
```

To mask a field in app config, put `data-support-mask` on it (in an `Html` block, or any block that renders your markup), or list a selector for it in `maskSelectors`.

## Properties

| Property                | Type     | Default             | Description                                                                                 |
| ----------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `label`                 | string   | `"Take screenshot"` | The button text.                                                                            |
| `hideSelectors`         | string[] | `[]`                | CSS selectors of elements left out of the screenshot, such as the panel the button sits in. |
| `maskSelectors`         | string[] | `[]`                | CSS selectors drawn as solid grey boxes, beside the built-in masks.                         |
| `s3PostPolicyRequestId` | string   | —                   | The request that returns the S3 presigned POST policy for the upload.                       |
| `fileName`              | string   | `"screenshot.png"`  | The uploaded file's name.                                                                   |
| `disabled`              | boolean  | `false`             | Disables the button and the `capture` method.                                               |

Built-in masks: `input[type="password"]` and `[data-support-mask]`.

## The editor

After a capture the screenshot opens in a modal (above the floating panel's layer) with two tools:

- **Blur:** drag a box; that area is blurred in the uploaded image. Drag again for more boxes. The blur shrinks the area to a twelfth and stretches it back, so the original pixels are not in the file.
- **Crop:** drag a box; the uploaded image is cut to it. Dragging again replaces it.

Then **Use** uploads the image and closes the editor, **Retake** closes the editor and captures again, and **Cancel** (or Escape) discards it.

## Events

| Event     | Fires                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `onUse`   | After the edited screenshot is uploaded. `_event = { file: { key, name, size, type } }`.                                        |
| `onError` | When the capture or the upload fails. `_event = { message }`. A failed upload keeps the editor open, so Use can be tried again. |

An upload counts only when S3 answers with a 2xx. A refused post (over the policy's size cap, an expired policy), a network error or an abort fires `onError` and never `onUse`.

## Methods

| Method    | Does                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| `capture` | Captures the page and opens the editor, as the button does. For a page with its own button. |

## Limits of drawing the DOM

The screenshot is a drawing of the page's DOM and styles, not the pixels on the screen, so some things do not come out:

- **Cross-origin content:** images served without CORS headers, `iframe` contents and canvases that hold cross-origin data are drawn blank.
- **Some CSS effects:** `backdrop-filter`, some blend modes and filters, and some pseudo-element content may be missing or differ.

When the screenshot misses what matters, an image the user takes themselves and uploads covers it.
