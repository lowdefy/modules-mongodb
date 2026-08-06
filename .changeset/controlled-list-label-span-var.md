---
"@lowdefy/modules-mongodb-workflows": minor
---

The `controlled_list` form component takes a `label_span` var (number, default `0`), following the existing `button` / `alert` convention. The outer `Label` wrapper gets layout `span: 24 - label_span` with `push: label_span`, so the whole field shifts into the input column and lines up with the labelled fields above it. With the var unset (`0`), rendering is unchanged.
