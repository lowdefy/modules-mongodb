---
title: AvatarUpload
module: plugins
type: reference
---

# AvatarUpload

A round avatar that is itself the upload control. It shows the current photo — the block value, an image data URI — or an initials fallback, with a hover/focus overlay to pick a new image. Click, keyboard (Enter / Space), or drag-and-drop a file onto it.

Picked files are center-cropped square, downscaled to `maxDimension`, and re-encoded as JPEG at stepped quality (then at halved dimensions) until the decoded size fits under `maxBytes`. The value handed to state is therefore always a data URI small enough to store inline on a MongoDB document — no upload policy or object store involved.

Used by the shared `avatar-picker` row (`modules/shared/profile/avatar-picker.yaml`) that the `user-account` module renders on its onboarding page and profile edit modal, where the value binds `profile.photo` and the write-profile fragment makes it the stored `profile.picture`.

## Usage

```yaml
- id: profile.photo
  type: AvatarUpload
  properties:
    size: 76
    maxBytes: 512000
    maxDimension: 512
    initials: AL
    background: "linear-gradient(135deg, #c62828, #ad1457)"
  events:
    onError:
      - id: show_photo_error
        type: DisplayMessage
        params:
          status: error
          content:
            _event: message
```

`initials` and `background` only render while no photo is set. A transparent PNG is flattened onto white before the JPEG encode (JPEG carries no alpha), and the photo renders on a white ground for the same reason.

## Properties

| Property       | Type    | Default        | Description                                                                   |
| -------------- | ------- | -------------- | ----------------------------------------------------------------------------- |
| `size`         | integer | `96`           | Avatar diameter in px.                                                        |
| `initials`     | string  | —              | Fallback text shown when no photo is set.                                     |
| `background`   | string  | theme fill     | CSS background (color or gradient) for the initials fallback.                 |
| `maxBytes`     | integer | `512000`       | Hard cap for the stored image in decoded bytes.                               |
| `maxDimension` | integer | `512`          | Photos are downscaled to at most this many px per side.                       |
| `disabled`     | boolean | `false`        | Disable picking or removing a photo.                                          |
| `removable`    | boolean | `true`         | Show a remove control when a photo is set. Removing sets the value to `null`. |
| `changeLabel`  | string  | `Change photo` | Hover overlay label when a photo is set.                                      |
| `emptyLabel`   | string  | `Add photo`    | Hover overlay label when no photo is set.                                     |

## Events

| Event      | Fires when                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `onChange` | A new photo has been picked and compressed, or the photo was removed. The value is already set when it fires.                   |
| `onError`  | The picked file is not an image, or cannot be compressed under `maxBytes`. `_event: message` carries a user-facing description. |

## Server-side guard

The block enforces `maxBytes` in the browser only. An API that stores the value should re-check it — `user-account`'s `update-profile` rejects a `profile.photo` that is not a `data:image/` URI or exceeds 720 000 characters (≈ 512 KB decoded plus the data-URI prefix).
