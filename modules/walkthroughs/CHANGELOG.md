# @lowdefy/modules-mongodb-walkthroughs

## 0.42.0

### Minor Changes

- [#234](https://github.com/lowdefy/modules-mongodb/pull/234) [`a52d4dd`](https://github.com/lowdefy/modules-mongodb/commit/a52d4dd5679334463076e94aa3f2c92ba226c8c8) Thanks [@Yianni99](https://github.com/Yianni99)! - walkthroughs: a new module for step-by-step guides

  Step-by-step walkthroughs, stored and played in-app rather than at a third-party host. A
  walkthrough is a title, an overview and an ordered list of steps; a step is a caption with an
  optional screenshot and an optional focus point marking where the highlight belongs. The
  annotation is held as data, so a highlight can be moved without re-shooting the step.

  The module ships the data model, a player that renders one step at a time, and an editor that
  works on a draft and publishes it explicitly — what a reader sees changes only when the author
  says so. Authoring is off unless the app sets `writable`, which keeps both connections read-only
  and makes every authoring endpoint refuse outright.

  `WalkthroughCapture`, `WalkthroughImageTarget` and the `WalkthroughUploadStepImage` action are new
  in the plugins package. Capture shares a window or screen and returns a still frame; the upload
  action hashes the bytes, asks for a presigned policy and posts it.
