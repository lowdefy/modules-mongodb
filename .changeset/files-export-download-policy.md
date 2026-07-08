---
"@lowdefy/modules-mongodb-files": minor
---

Export the files module's download-policy request as a named component so it can
be consumed outside the `file-manager` / `file-list` components. Consumers that
render downloadable files themselves — such as the events module's
`EventsTimeline` — can now `_ref` it inside a page's `requests:` list:

```yaml
requests:
  - _ref: { module: files, component: download-policy, vars: { block_id: <id> } }
```

This yields a presigned-GET request with id `download_policy_<block_id>` on the
module's `files-bucket` connection, which the consumer passes as its
`s3GetPolicyRequestId`. Previously the only module-owned download policy lived
inside `file-manager` / `file-list`, forcing consuming apps to keep their own
copies.
