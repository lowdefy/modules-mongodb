# @lowdefy/modules-mongodb-ai-assistant

## 2.0.0

### Major Changes

- [#316](https://github.com/lowdefy/modules-mongodb/pull/316) [`e857039`](https://github.com/lowdefy/modules-mongodb/commit/e8570395614810b639ca73540b8aa6764fe3e854) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Breaking: v2 makes the files module safe for an app with many organizations.** Until now anyone signed in who held a file's key could get a download link for it, whatever organization or record it belonged to, could keep or forward that S3 link after their access ended, and could save a record over another file's key. Every file operation now goes through a files module endpoint that loads the record and runs an access check the app can supply. Every file a module shows is a stable link on the app's own domain, `/api/endpoints/...`, that checks the caller's session and access each time it is opened and then redirects to an S3 link signed for 60 seconds. Every module and the plugin move to 2.0.0 together, on Lowdefy 7.2.0 or later (the first release with link endpoints). Files already uploaded stay where they are and keep working, so there is no data migration.

  To upgrade an app:

  1. **Move to Lowdefy 7.2.0.** Set `lowdefy: 7.2.0` in `lowdefy.yaml` and move the `lowdefy` and `@lowdefy/*` packages to 7.2.0.
  2. **Move off the removed files requests.** The `get-entity-files`, `upload-policy` and `download-policy` page requests and the `download-policy` component export are gone. The `file-manager`, `file-card` and `file-list` components need no page requests now. An app that lists, uploads, saves or deletes files itself calls the endpoints `list-files`, `upload-policy`, `save-file` and `delete-file` (`files/<endpoint>` in app config). `save-file` takes `{ entity_type, entity_id, key, thumbnail?, file_title?, file_category?, metadata? }` with a key `upload-policy` minted, and `delete-file` takes `{ file_id }`. A file opens through the `file` link endpoint, `GET /api/endpoints/files/file/<key>`. See `docs/files/reference/endpoints.md`.
  3. **Decide who may work with a record's files.** Without config, every signed-in member of the organization may. To narrow it, write an app endpoint that answers `{ allowed: true }` or `{ allowed: false, message }` for `{ operation, entity_type, entity_id, file_id }` and name it in the files module's `access_check: { endpoint_id }` var. It may be asked about a record that is not saved yet (the activities module mints an activity's id before saving it).
  4. **Check the upload limits.** Uploads are capped at `max_file_size`, 25 MB by default; raise it if the app takes larger files. Set `allowed_content_types` to limit the types `upload-policy` accepts.
  5. **Point the download blocks at a link endpoint.** FileDownload, FileManager, EventsTimeline, DataDescriptions and SmartDescriptions take `linkEndpointId` (and an optional `linkPath`, path segments before the key) in place of `s3GetPolicyRequestId`; with only the old property set they show no links. Use `files/file` for files module records, and the workflows module's `form-file` with `linkPath: [workflow_id]` for workflow form files. Each file renders as a plain link that opens in a new tab and can be copied.
  6. **An app that signs its own files** for these blocks writes a link endpoint (`type: Api`, `link: true`). It gets `{ path, query }` as its payload, where `path` is everything after its id, loads the record the file belongs to, checks access, and returns the signed URL to redirect to; to refuse, it rejects with a `:status` (`:reject: …` with `:status: 404`).
  7. **Refused files show a bare status page.** A file link opened while signed out answers 401, and one the endpoint refuses (not found, deleted, another organization's, or refused by `access_check`) a 404 with no body, which the new tab shows as the browser's own status page. The `access_check` message is no longer shown on a download; it still shows on list, upload, save and delete.
  8. **`onDownload` and the `download-file` event mean "clicked".** FileManager's `onDownload`, the `file-manager` and `file-card` components' `on_download` var and their `download-file` event (with `log_events`) fire when a file link is clicked, not when a download is verified: a refused file still logs, and opening a copied link does not. Treat them as a client-side record, not an audit trail.
  9. **Events timeline:** the `events-timeline` component's `s3GetPolicyRequestId` var is now `file_link_endpoint_id`, null by default. Set it to `files/file` to show links for files on `event.files`. A file there that is not a file record answers 404.
  10. **Workflows:** the `file_download` field's `s3GetPolicyRequestId` var is replaced by `link_endpoint_id` and `link_path`, which default to the workflows module's `form-file` with the page's `[workflow_id]`, so form files keep opening with no app config. Drop `s3GetPolicyRequestId`; to show files module records in the field, set `link_endpoint_id: files/file` and `link_path: []`. The overview pages no longer pull in the files module's `download-policy`.
  11. **Workflow form uploads must carry the organization.** The app's `upload_files` request (the `file_upload` field's `s3PostPolicyRequestId`) must mint keys under `{organization_id}/workflows/`, for example `{organization_id}/workflows/{workflow type}/{uuid}/{name}`; see the `file_upload` field in `docs/workflows/reference/form-components.md`. Submitting a form refuses a new file under any other key, and `form-file` opens only those keys and keys from before the upgrade, so a form file with another organization's key, or a files module or support key, no longer opens.
  12. **Apps that share workflow data share a base path and a workflows entry id.** Images pasted into a workflow rich-text field are saved as a `form-file` link that holds the app's base path and the workflows module's entry id, so every app that shows the same workflow data must use the same base path and the same entry id for the workflows module. Images saved before the upgrade keep their S3 URLs.
  13. **Notification attachments need sign-in.** The notifications `file-download` page is no longer public: a signed-out recipient who opens an emailed attachment goes through sign-in first, and only the notification's recipient can open it. Emailed links don't change.
  14. **List every uploading domain in the bucket's CORS.** Uploads still go straight from the browser to S3. An app served on several domains lists each one in the bucket's CORS `AllowedOrigins`. File links carry no host, so they work on every domain, each checked with that domain's session.
  15. **Support uploads** land under `{organization_id}/support/{user id}/`, or `support/{user id}/` for a user with no organization. An app that signs or checks support keys by the `support/{user id}/` prefix must accept the organization prefix too.
  16. **Guard the app's own signing requests.** A page request that signs any key the browser sends gives anyone signed in every object in the bucket, including other organizations' files. An app that signs its own download links for other prefixes in the same bucket (chat attachments, for example) should sign only keys under the caller's own prefix and return a null key for any other, as `apps/demo/modules/ai-assistant/attachment_requests.yaml` does.

  New uploads land under `{organization_id}/files/{entity_type}/{entity_id}/`; older objects keep their keys and still open, because signing goes by the record rather than the key. The other entries in this release give each module's changes in full.

### Minor Changes

- [#333](https://github.com/lowdefy/modules-mongodb/pull/333) [`0f711e1`](https://github.com/lowdefy/modules-mongodb/commit/0f711e1dcf8d5e5d19ee0dd77e347e39fcf44bb7) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **ai-assistant, ai-reporting:** Model calls run with zero data retention and only on Anthropic by default, and both chats show a notice under the composer.

  - **Changed defaults, ai-reporting:** the reporting assistant and the report page's AI summary now send `zeroDataRetention: true` and `only: [anthropic]` to the AI Gateway, from the new vars `zero_data_retention` (default `true`) and `providers` (default `[anthropic]`). If you set `model` to a non-Anthropic model, set `providers` to match.
  - **Changed defaults, ai-assistant:** the thread-title call now runs with `title_zero_data_retention: true` (was `false`) and the new `title_providers: [anthropic]`, and `title_model` defaults to `anthropic/claude-haiku-5.5` (was `openai/gpt-5-mini`, which an Anthropic-only route cannot serve). If you set `title_model` to another provider's model, set `title_providers` to match. Your own agent is yours to configure: set `zeroDataRetention: true` and `only: [anthropic]` on it, as the docs now show.
  - **A notice under the composer, by default, in both modules:** "Don't enter personal information such as names, ID or employee numbers, salaries or contact details. Chats are processed by an AI service and kept for 90 days. Privacy Notice". New vars on both: `privacy_notice_url` (the Privacy Notice link, opened in a new tab; left out when unset) and `retention_days` (default 90, the number in the notice; your TTL index on the conversations collection should match). ai-reporting gains `composer_note`. In both, `composer_note` replaces the text and `composer_note: false` hides the note. **ai-assistant apps that left `composer_note` unset now show this notice**; set `composer_note: false` to keep the old look.
  - **Plugins:** the `AiText` connection's `GenerateChatTitle` takes `only`, and `SummarizeReportData` takes `zeroDataRetention` and `only`, passed to the AI Gateway as `providerOptions.gateway`.

- [#333](https://github.com/lowdefy/modules-mongodb/pull/333) [`d591465`](https://github.com/lowdefy/modules-mongodb/commit/d5914658effa986130144878798bba74319e6949) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **ai-assistant, ai-reporting:** The chat refuses a typed message that looks like personal information before it is sent. An email address, nine or more digits with only spaces between them (ID, bank and account numbers), a South African phone number or a South African passport number stops the send: the chat shows "This looks like personal information. Please remove it and describe the task instead." and keeps the text in the composer, and nothing reaches the agent.

  - **On by default.** New vars on both modules: `pii_guard` (`true`; `false` turns the check off), `pii_patterns` (the regex list; setting it replaces the default) and `pii_guard_message`.
  - **ai-reporting gains `on_before_send`**, the same seam ai-assistant has, run after the guard.
  - **The reporting agent** answers a message with personal information in it with a short reminder that personal details aren't needed, then the answer, without repeating them.
  - **Upgrade:** nothing to change. Check that your users don't ask about long numbers the guard now blocks, such as purchase orders (`PO 4500012345`); if they do, set `pii_patterns` with your information officer's agreement. Message editing skips the check, so keep it off while `pii_guard` is on. See `docs/shared/personal-information.md`.

- [#333](https://github.com/lowdefy/modules-mongodb/pull/333) [`e2c3e6a`](https://github.com/lowdefy/modules-mongodb/commit/e2c3e6adfd26924c9d0968183852ac6869000c15) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Deleting a chat now removes its text, and chats can expire 90 days after they start.** In both chat modules a delete marked the thread or conversation deleted and kept everything in it, and in `ai-reporting` a deleted conversation still opened by its id. Now the same write that marks it deleted clears its messages and title (and, in `ai-reporting`, its result panel's `data_parts`), and every read of one chat returns nothing for a deleted id. A reply that finishes after the delete, through the browser's save or the agent's `onFinish` hook, writes nothing back, so the text stays gone even when the chat was deleted while the answer was still arriving. Saved reports are not chats and keep their soft delete.

  To expire chats, declare a TTL index on the creation date, set to your retention period (90 days is `expireAfterSeconds: 7776000`): `{ created: 1 }` on the `ai-assistant` threads collection and `{ "created.timestamp": 1 }` on the `ai-reporting` conversations collection. Replace any TTL index those collections already have (for example one on `updated`, which never expires a chat still in use) rather than adding beside it. See the `ai-assistant` docs' "Retention and delete" section and `ai-reporting`'s expected indexes. Files people attach in `ai-assistant` live in your app's storage, which delete and the TTL do not reach: expire your chat upload prefix at the same period.

- [#333](https://github.com/lowdefy/modules-mongodb/pull/333) [`163534b`](https://github.com/lowdefy/modules-mongodb/commit/163534b9db557f73fa37c2ab21ffd55ecfcee4b1) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Personal information is masked on the server, before the model sees it and before a chat is stored.** The browser guard only stops what an honest user types: anyone signed in can call the chat endpoints or the agent route directly. Now, while `pii_guard` is on (the default), every match of `pii_patterns` in a message's text becomes `[removed]`:

  - `ai-reporting`'s agent sets Lowdefy's `redact`, so the model, the title call, the tools and the hooks see masked text. Its `save-conversation` and `set-conversation-title` endpoints mask what they store too. **`ai-reporting` now needs Lowdefy 7.2 or later**: earlier releases reject the agent's `redact` at build.
  - `ai-assistant`'s `save-thread`, `save-thread-on-finish`, `title-thread` and `rename-thread` mask the messages and titles they store, and `title-thread` masks the exchange it sends the titling model.

  `ai-assistant`'s agent is your app's, so set its `redact` yourself with the new `agent-redact` component: `redact: { _ref: { module: ai-assistant, component: agent-redact } }`. It needs Lowdefy 7.2 or later. Files and screenshots are not masked; see the `ai-assistant` docs' "Masking on the server".

## 1.4.1

## 1.4.0

## 1.3.0

## 1.2.0

### Minor Changes

- [#313](https://github.com/lowdefy/modules-mongodb/pull/313) [`07e7fdd`](https://github.com/lowdefy/modules-mongodb/commit/07e7fdd8767333240d7551b188957b9000aa4d8a) Thanks [@puffin-mrm](https://github.com/puffin-mrm)! - **A reply that finishes after the person leaves the page is kept.** Only the browser saved the assistant's reply, when it finished streaming, so moving to another page mid-reply lost it, even though the agent finished on the server. The new `save-thread-on-finish` endpoint stores the reply from the server. Set it as your agent's `onFinish` hook:

  ```yaml
  agents:
    - id: support
      hooks:
        onFinish:
          - ai-assistant/save-thread-on-finish
  ```

  Each time the panel opens it re-reads the stored thread, so the finished reply is there, also when the chat was streaming when the person left. A page with the embedded chat gets the same by running `enter` in its `onMount` as well as its `onInit`. A thread still waiting for its reply shows a one-line status above the chat, "The assistant is still replying.", with a **Check again** link.

  `save-thread` now merges the history it is sent with the stored one rather than replacing it, so a reply the hook stored survives the browser's next save. The chat sends `known_ids`, the ids of every message it has held, and a stored message is dropped only when it is one of those. An app that calls `save-thread` itself without `known_ids` gets the old behaviour: its history replaces the stored one.

  The `FloatingPanel` block's `onOpen` event now carries `{ first }`, true on the first open since the block mounted, when its children mount.

### Patch Changes

- [#311](https://github.com/lowdefy/modules-mongodb/pull/311) [`1bf629e`](https://github.com/lowdefy/modules-mongodb/commit/1bf629e13e03d995a4b8ddbf4c0a2134e513047d) Thanks [@puffin-mrm](https://github.com/puffin-mrm)! - **ai-assistant:** opening the panel now shows the thread as it is stored, not the copy the page held from an earlier visit. Messages sent on another page, and a thread switched to there, show on going back without a refresh. A reply streaming on the page is left as it is. A page using `embedded` gets the same on each visit through the `enter` it already splices into `onMount`. Nothing to change in your app. One difference to know: a new chat nobody has sent in yet is not stored, so closing and reopening the panel returns to the thread last opened.

## 1.1.0

## 1.0.0

### Major Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

  To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

  - **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
  - **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
  - **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
  - **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
  - **Events:** `contact_page_url` is replaced by `contact_page_id`.
  - **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
  - **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.

### Minor Changes

- [#294](https://github.com/lowdefy/modules-mongodb/pull/294) [`32f79c2`](https://github.com/lowdefy/modules-mongodb/commit/32f79c2a736d4840baeebfd731be96c698e6faed) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **Take a screenshot from the assistant's chat panel.** With `screenshot: true`, the panel gets a Take screenshot button. It captures the page behind the panel with password inputs, `[data-support-mask]` elements and the `screenshot_mask_selectors` var's matches blanked, lets the user blur or crop it, and attaches it to the composer like any file, so the agent can send it with a support ticket. The chat uploads it through `sender_attachments`, so attachments must be on and the app's upload policy must accept an image. Not shown in the embedded shell.

- [#287](https://github.com/lowdefy/modules-mongodb/pull/287) [`c6ea2f1`](https://github.com/lowdefy/modules-mongodb/commit/c6ea2f11150bb3f7174cb5cadca99be6a678d4b0) Thanks [@Gervwyk](https://github.com/Gervwyk)! - **File attachments in the assistant's chat, with stored file links signed again on open.**

  `sender_attachments` turns on file attachments in the composer. It is passed through as the chat block's `sender.attachments`, naming the app's own upload and download requests. Null, the default, leaves attachments off.

  A file part keeps the link signed at upload, which stops working within days, so a thread reopened later would send the model dead links. `file_links_endpoint` names an app endpoint that signs new ones: when a thread is opened or resumed, the module collects the file parts that carry a storage key and calls it once with `{ files: [{ key, filename, mediaType }] }`. It returns `{ files: [{ key, url }] }`. Each part takes its key's new link, and a key returned with no url keeps the stored link. The keys come from the browser, so the endpoint must check each is one the caller may read before signing it.

- [#253](https://github.com/lowdefy/modules-mongodb/pull/253) [`0934897`](https://github.com/lowdefy/modules-mongodb/commit/09348976bb082886ef7429ef75eddb54d24de079) Thanks [@SamTolmay](https://github.com/SamTolmay)! - New `open-with-prompt` component: an action list for a button anywhere on a page that mounts `panel`. It opens the panel on a new thread and sends its `prompt` var (a string, or a runtime operator resolved on click) into it, whether the panel is open on another thread, closed, or was never opened. The earlier thread stays in the list, untouched. Like the welcome prompts, the send does not run `on_before_send`.

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

### Patch Changes

- [#253](https://github.com/lowdefy/modules-mongodb/pull/253) [`19cf65a`](https://github.com/lowdefy/modules-mongodb/commit/19cf65a5c6d04cbfefc246d8f8c0dad91c5064ca) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Threads save again when the `tag` var is left unset, and thread titling runs when `title_context` is left unset. Both vars default to null, and the `save-thread` and `title-thread` endpoints refused a null `tag` or `context` against their payload schemas, so an app that set neither never persisted a thread.

- [#253](https://github.com/lowdefy/modules-mongodb/pull/253) [`5e4d09e`](https://github.com/lowdefy/modules-mongodb/commit/5e4d09e1650bb9748e046f299699e01ea4068996) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **The ai-assistant module installs under `auth.organizations.policy: tenant`.** The threads connection is walled like any MongoDB connection, so each organization keeps its own thread history. The `AiText` connection (thread titling) holds no data and declares itself non-scopable (`tenant: false`).

## 0.48.0

## 0.47.0

### Patch Changes

- [#264](https://github.com/lowdefy/modules-mongodb/pull/264) [`51b2790`](https://github.com/lowdefy/modules-mongodb/commit/51b2790aea96a956b861a619aa5946f0b5c310dd) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: one tooltip per toolbar button

  - Fix the double tooltip on the embedded toolbar's icon-only buttons. `toolbar.icon_only` wrapped each button in a tooltip, but the Button already shows its title as a tooltip when the title is hidden, so each showed twice.
  - The toolbar icons in both the panel and the embedded shell no longer show a browser tooltip naming the icon ("Outline Plus").

## 0.46.0

### Minor Changes

- [#262](https://github.com/lowdefy/modules-mongodb/pull/262) [`6068a64`](https://github.com/lowdefy/modules-mongodb/commit/6068a64f02a22c35426e2e21b3f3d8acf6e5f70e) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: an icon-only toolbar for the embedded chat

  - New `toolbar.icon_only` var hides the labels of New chat, Manage chats, Back to chat and Delete chat in the embedded shell. Each button keeps its icon, and a tooltip gives its name on hover. Off by default, so existing pages keep their labelled buttons.

## 0.45.0

### Minor Changes

- [#260](https://github.com/lowdefy/modules-mongodb/pull/260) [`06a9e17`](https://github.com/lowdefy/modules-mongodb/commit/06a9e1771148a399ff13ba5af96bca00cb4b42a3) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: follow a scope that changes mid-session, and recolour the composer

  - `enter` now notices when the `scope` var no longer matches the scope the open thread belongs to, drops that thread and its list, and resumes in the new scope. Apps with an active-company or active-record switcher no longer need their own reset on every visit. A page hosting `embedded` should splice `enter` into `onMount` as well as `onInit`.
  - New `sender` var, merged over the chat's composer properties, so the composer's `styles` and `classNames` can be set. Together with `styles` under `message_display.roles`, this recolours the chat without `!important` (Lowdefy 6.1 or later).

## 0.44.2

### Patch Changes

- [#259](https://github.com/lowdefy/modules-mongodb/pull/259) [`0eef584`](https://github.com/lowdefy/modules-mongodb/commit/0eef584c9b7148d59b7b175e436ea4c835e31eb7) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: keep threads and their names intact, and refuse calls with no session

  - New chat, Manage chats and Delete are disabled while a reply streams. Switching mid-reply dropped the reply before it could be saved, and left the thread named after its question.
  - A name the user types is kept. Renaming before the first reply skips titling, a rename while the title is generating wins, and a later save no longer puts an older name back.
  - The generated title updates the thread list even after the user has switched threads.
  - Every endpoint rejects a call with no signed-in user, and `title-thread` refuses when titling is off.
  - The empty thread list reads in secondary text, and thread tag chips have a background.
  - Docs: the panel mount example sets its vars on the module entry, and `on_before_send` is documented as a browser-side check that some sends skip.

## 0.44.1

## 0.44.0

### Minor Changes

- [#248](https://github.com/lowdefy/modules-mongodb/pull/248) [`fad5d0a`](https://github.com/lowdefy/modules-mongodb/commit/fad5d0a4235374e4449d099f00bf7cad47ce8f5b) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: `composer_note` shows a fixed line under the chat's composer

  An app can now put a standing note under the composer in both the docked panel and the embedded chat, such as a reminder not to share personal information. It stays visible alongside the conversation without becoming a message in it, and nothing is shown by default.

- [#248](https://github.com/lowdefy/modules-mongodb/pull/248) [`48676e9`](https://github.com/lowdefy/modules-mongodb/commit/48676e945078271bf904a8b67432ff4fdbe4a085) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: `title_zero_data_retention` keeps thread titling on zero-data-retention providers

  Titling sends a thread's first question and reply to the title model. An agent can already restrict
  its routing to providers with a zero data retention policy, but titling had no way to follow, so it
  could land on a provider that retains what it's sent. The `GenerateChatTitle` request takes
  `zeroDataRetention`, and the module passes it from the new var, which defaults to off.

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

### Minor Changes

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`c222639`](https://github.com/lowdefy/modules-mongodb/commit/c2226394d747fb08beeb7e210e9a908be7abb592) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: say when the assistant is unavailable

  An app that has stopped the assistant — a workspace out of AI credits, a paused tenant — had
  nowhere to say so. The chat still offered a composer, and a message sent into it failed on its
  own terms, which reads as the assistant being broken rather than switched off.

  The new `notice` var takes `{ type, message, description }` and replaces the conversation with
  that alert, taking the composer with it. The thread list stays reachable, so earlier answers can
  still be read. Null, the default, shows the chat as normal.

### Patch Changes

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`f4f3ada`](https://github.com/lowdefy/modules-mongodb/commit/f4f3adaac16c47a7f49ffe66e6bed8f636a09cd0) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: run `on_thread_change` when the open thread is deleted

  Deleting the open thread mints a fresh conversation to land in, which is the active thread
  changing by a user action — but `delete-thread` never ran `on_thread_change`, so a consuming
  app was not told. Anything derived from the open conversation and rendered outside the chat
  kept describing the thread that had just been deleted, and stayed that way until the user
  opened another one. That reads as wrong data rather than as missing data.

  `new-thread` and `select-thread` already ran the seam; this was the third way the active
  thread can change, and the only one that did not.

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`dbcd7b7`](https://github.com/lowdefy/modules-mongodb/commit/dbcd7b7b23bb084efb0f3b4cce1ac9beb5639c8f) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: survive a turn that is cut off mid-stream

  A reply that stopped early left its tool call with no result. That pairing cannot be sent back
  to the model, so every later message on the thread failed before it reached one, and the thread
  could not be opened again either — the stored history no longer validated. One interrupted reply
  therefore killed the conversation permanently, and the only signal was that nothing happened.

  Unresolved tool calls are now dropped when the history is saved and again when a thread is
  loaded, along with any message left carrying nothing. The load side is what brings threads
  already stored in that state back.

  A turn that ends without an answer also says so. This is not an error the chat can report —
  the stream closes normally and only carries nothing — so it went by in silence, which reads as
  the assistant ignoring the question and invites the same question again.

  Deleting a single message now keeps the stored thread in step. Regenerating or editing one
  already did, because each ends in a send the thread is saved from; deleting ends there, so the
  message came back on the next reload.

- [#232](https://github.com/lowdefy/modules-mongodb/pull/232) [`dc1c696`](https://github.com/lowdefy/modules-mongodb/commit/dc1c6967631b97c371600f83a8f4a80f35334535) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: the threads index on `{ conversationId, user_id }` should be unique

  Saving a thread upserts on that pair. Two saves that race and both find no existing row will
  both insert, and MongoDB allows it unless the index is unique — so one conversation ends up
  stored twice, showing twice in the list, with whichever row the query reaches first being the
  one that reads back. The index was already recommended for speed; it is needed for correctness
  too. Apps that added it as non-unique should replace it.

## 0.40.0

### Minor Changes

- [#229](https://github.com/lowdefy/modules-mongodb/pull/229) [`82473ca`](https://github.com/lowdefy/modules-mongodb/commit/82473ca1f790082ffeb45920ae8015969f0a335f) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: let an app colour the chat where it currently inherits antd's primary

  Three surfaces took their colour from `--ant-color-primary*` with no way to change it: the
  selected chat in the thread list, the embedded toolbar's buttons, and the assistant's name chip
  in the docked panel. That is right where the app's primary IS its accent, and wrong where it is
  a neutral — an app with a grey `colorPrimary` gets a grey selected chat that looks hovered, and
  a grey name chip on a grey tint, which is the one thing that chip exists to avoid. Nothing an
  app could write in its own stylesheet fixed it: the thread list's selected class is generated,
  and the panel's chip rule lands at the same specificity a consumer can reach, so the two tie
  and the plugin wins on order.

  - `thread_selection` — `{ border, background }` for the selected chat.
  - `toolbar` — `{ size, accent, accent_text, secondary }` for the embedded shell's toolbar: the
    antd button size, the fill marking the primary action, and the fill behind the rest.
  - `--fp-role-assistant-bg` / `--fp-role-assistant-fg` — CSS custom properties the FloatingPanel
    stylesheet now reads for the assistant's name chip.

  The chat title's size is also pinned to 1rem. `level: 5` asked for a semantic heading, so the
  title took whatever the consuming app decided `h5` means — an app that styles h5 as metadata,
  which is a common choice, rendered the chat title at secondary-text size. A consumer that had
  deliberately sized the title through `h5` will now see 1rem instead.

  Decisions:

  - Every default is today's value, so no existing consumer changes appearance. `toolbar.size`
    stays `small` for the same reason, even though 24px is slight for what are the shell's
    primary actions — an app that wants bigger now says so.
  - `toolbar` covers the embedded shell only. The panel's buttons are icon-only in a 420px
    column, where `small` is right and a fill would read as chrome rather than as an action.
  - The toolbar fills are set on the blocks via their `.element` css key rather than left to a
    consumer stylesheet. Reaching those buttons from outside means selecting on module-internal
    block ids, which a release can rename with nothing raising an error on the consumer's side.
  - The panel chip uses CSS custom properties rather than a var, because the rule lives in the
    plugin's stylesheet and never passes through the module's var resolution.

- [#229](https://github.com/lowdefy/modules-mongodb/pull/229) [`82473ca`](https://github.com/lowdefy/modules-mongodb/commit/82473ca1f790082ffeb45920ae8015969f0a335f) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: ask before deleting a chat

  Delete chat destroyed the open thread on the click. `delete-thread.yaml` went straight to the
  delete endpoint, and neither the embedded toolbar's button nor the panel's carried a guard, so
  one stray click took the conversation and every answer in it, and the control sits directly
  beside "New chat" and "Manage chats", which is where a mis-click lands.

  Both shells now open a confirm first, naming the thread. (The delete itself is soft as of the
  accompanying change, so the confirm's wording stops at the chat leaving the user's list rather
  than claiming the conversation is destroyed.)

  Decisions:

  - No var to switch it off. A confirm nobody opted into is a confirm nobody has, and the cost
    is one extra click on the rarest action in the shell. That makes this a behaviour change for
    existing consumers, hence minor rather than patch — a delete that used to happen now waits
    for an answer.
  - `ConfirmModal`, not the `Modal` that ai-reporting's delete confirm uses. The panel stacks at
    1100 and the `Modal` block does not forward `zIndex`, so a `Modal` would open behind the
    panel that launched it. `ConfirmModal` does forward it; 1200 matches the panel's own
    tooltips. ai-reporting's modal sits on an ordinary page and never had to clear a panel.
  - `delete-thread.yaml` is unchanged and runs from `onOk`. It already captures
    `ai_conversation_id` before replacing it, so nothing is seeded for the confirm and
    cancelling leaves no state behind.

- [#229](https://github.com/lowdefy/modules-mongodb/pull/229) [`bfe0493`](https://github.com/lowdefy/modules-mongodb/commit/bfe049331c40f5af80517f96ce82d1c6450a4c62) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: deleting a chat no longer destroys it

  Delete chat removed the thread from the collection outright. It was the only hard delete left in
  the repo — every other module that deletes its own documents marks them with a `deleted` change
  stamp and filters them out of reads. A chat is the user's own record of what they asked and what
  they were told, and the confirm added alongside this is a prompt, not a safeguard: it cannot
  help the person who meant to click it and then wanted the thread back.

  Deleting now sets the `deleted` stamp, which also records who deleted the thread and when, and
  every read filters on it — the thread list, the resume-on-open lookup, the message replay, and
  the rename and generated-title writes.

  Decisions:

  - The stamp is written from the module's own `defaults/change_stamp.yaml` rather than the events
    module's exported component, because this module declares no dependencies. Same choice, and
    the same shape, as ai-reporting — so a host app reads it with one predicate across every
    module.
  - No restore control, and none planned here. The point is that the conversation survives a
    stray click; recovering one is an operator action against the collection. Adding a deleted-
    chats view would be a second feature, and pretending to offer recovery in the confirm would
    be worse than saying nothing.
  - The confirm's copy changed with it. It used to say the chat was "deleted for good" and could
    not be undone, which is no longer true — it now says the chat is removed from the user's
    chats and cannot be opened again, which is what the user actually experiences.
  - The read predicate is deliberately absent from `save-thread`'s filter. That filter drives an
    upsert, and `$exists` is not an equality clause, so a no-match would mint a second row under
    the same conversationId rather than skip the write. A save already in flight when the delete
    lands therefore rewrites the deleted row's messages but leaves the stamp intact, so the
    thread stays gone from every read. `deleted: null` is initialised on insert instead, so live
    threads have one shape.
  - `disableNoMatchError` is set, and is load-bearing rather than tidy-up. `MongoDBDeleteOne`
    never complained about matching nothing, but `MongoDBUpdateOne` throws "No matching record to
    update." on a zero match unless the flag is set or the write is an upsert — so switching to
    an update would otherwise have turned two harmless cases into errors: deleting a thread that
    was minted but never sent in (no row exists until the first message is saved), and a repeat
    delete. Both now report zero modified, and a repeat can no longer overwrite the original
    stamp's who and when.

  Minor rather than patch: existing rows are untouched and reads treat a missing `deleted` field
  as live, so nothing needs migrating — but a consumer that counted on the collection shrinking,
  or that reads the collection itself rather than through the module's endpoints, now sees
  deleted threads and has to apply the same predicate.

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

### Minor Changes

- [#205](https://github.com/lowdefy/modules-mongodb/pull/205) [`1c35006`](https://github.com/lowdefy/modules-mongodb/commit/1c35006132524afc63671864c18ae31e5d1ec532) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: add a `feedback_values` var so stored ratings come back

  The chat block persists no rating: `on_feedback` hands one to the app and the app stores
  it. There was no way to hand it back, so a reload or a thread switch showed every message
  unrated even where the app had recorded the rating — a lost write rather than a display
  gap, as far as the user could tell.

  `feedback_values` takes a map of message id to `like` or `dislike`, in the same vocabulary
  `on_feedback` reports. A rating clicked during the visit takes precedence, so the thumb
  still responds immediately.

  Rebuild the map for the thread being opened, on both seams that open one. `on_thread_change`
  covers every switch, and a new `on_panel_open` var covers the thread the `panel` resumes when
  it opens — which nothing could see before, because `enter` runs inside the panel and no
  consumer actions followed it. Wiring only `on_thread_change` leaves the thumbs missing on the
  thread the user lands on and appearing once they switch, which is the confusing half-state.
  The `embedded` shell still has no open moment: a page using it splices its own actions after
  the `enter` component, as before.

  Requires Lowdefy 5.6.0, the release carrying the AgentChat `feedbackValues` property; on
  an older build the property is ignored and nothing changes. The plugin package's Lowdefy
  peer range now accepts `5.6.0` and no longer accepts
  `0.0.0-experimental-20260827105525` — that build predates the property, so it was only
  ever the pre-release stand-in for this release.

## 0.36.0

## 0.35.0

### Minor Changes

- [#203](https://github.com/lowdefy/modules-mongodb/pull/203) [`5324a5e`](https://github.com/lowdefy/modules-mongodb/commit/5324a5eba59323d41eecfe45687ba30107854f98) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: resume the thread you last opened, and add an `on_thread_change` seam

  Reloading dropped you into the wrong conversation. `enter` resumed the first item of
  `list-threads`, which is sorted `updated: -1`, and `updated` only moves when a message
  is saved — so merely reading a thread never marked it current, and a refresh landed you
  in whichever thread you had last SENT in. Opening a thread now stamps `last_opened`, and
  a new `get-active-thread` endpoint answers "what should I resume?" separately from "what
  order should the list be in?". The sidebar keeps its send-order, so reading a thread no
  longer reshuffles the list.

  Threads stored before this change have no `last_opened` and fall back to `updated`, which
  is the old behaviour — nothing needs migrating.

  The new `on_thread_change` var runs actions whenever the active thread changes by a user
  action: a thread opened from the list, or a new chat started. Anything a consuming app
  derives from the open conversation and renders outside the chat — a references panel,
  filters keyed to the current answer — previously had no way to know a switch had
  happened. It was built once on mount and from then on silently described the wrong
  thread, which reads as stale data rather than as missing data. `enter` deliberately does
  not fire it: a page splices its own actions after `enter` already, and firing both would
  run them twice on the first visit.

  Read the new thread from `ai_conversation_id` rather than the event — the two call sites
  deliver different events, and only the state is common to both.

## 0.34.0

### Minor Changes

- [#201](https://github.com/lowdefy/modules-mongodb/pull/201) [`fa99a04`](https://github.com/lowdefy/modules-mongodb/commit/fa99a04e93f6fc17244cb959d63169ab76d764e0) Thanks [@Yianni99](https://github.com/Yianni99)! - ai-assistant: add an `on_link_click` var, and soften the selected-thread highlight

  A link in an answer was a plain anchor, so following a citation was a full browser
  navigation out of the conversation with no way for an app to show the target in
  place. `AgentChat` now carries an `onLinkClick` event, and this exposes it as the
  `on_link_click` seam alongside `on_before_send`, `on_user_message`, `on_data_part`
  and `on_feedback`. The event gives you `href` and `text`.

  It is wired only when you supply actions. The block decides whether to intercept a
  click from the event's presence, and an event declared with an empty action array is
  still present — so passing the var through unconditionally would suppress every
  anchor in every consuming app and then run nothing. Wiring nothing changes nothing.

  Two things to know once you do wire it: an href you do not recognise navigates
  nowhere, because interception covers the whole message, so handle the fall-through;
  and modified or non-primary clicks are never delivered, so open-in-new-tab keeps
  working.

  The manage-chats list also passes its own `.selected` style now. `ListSelector`
  defaults to a primary border plus a `0 0 0 1px` primary ring, and a box-shadow ring
  keeps the radius it is given rather than growing to stay concentric — so the two
  curves fell out of phase and every corner rendered thick and faceted. It is now one
  soft primary border over a tinted fill, from theme tokens, so it follows dark mode
  and your own primary colour.

  Also widens the plugin package's Lowdefy peer range to accept
  `0.0.0-experimental-20260827105525`, the first published build carrying the event.

## 0.33.0

## 0.32.1

### Patch Changes

- [#195](https://github.com/lowdefy/modules-mongodb/pull/195) [`1d636ab`](https://github.com/lowdefy/modules-mongodb/commit/1d636ab506af9e5e528fbaa41366646a91fa6cbf) Thanks [@Yianni99](https://github.com/Yianni99)! - A thread now survives leaving the page mid-answer. Threads were persisted only when the reply finished streaming, from the chat block's `onMessageComplete` on the client, so sending a message and navigating away before the answer landed saved nothing at all: the thread was never created, leaving no history to resume and no record of what had been asked.

  The module now also saves on `onUserMessage`, whose payload already carries the message just sent. The worst case becomes a thread missing its answer rather than a thread that never existed, and it is named from the question rather than left as "New chat" — the provisional-title derivation is now a shared action used by both save paths, so the two cannot drift apart.

  `on_user_message` still runs after the module's own steps, so a consumer's actions on that event now see a thread that is already stored.

  This persists the question, not the answer: the reply is only ever known to the client that received it. An app that needs the answer in its stored history should write it from its agent's `onFinish` hook, which is awaited server-side and so still runs once the client has gone.

## 0.32.0

## 0.31.1

### Patch Changes

- [#191](https://github.com/lowdefy/modules-mongodb/pull/191) [`c8390b0`](https://github.com/lowdefy/modules-mongodb/commit/c8390b05e2e384ed8070e0025766b491b274852c) Thanks [@Yianni99](https://github.com/Yianni99)! - The `ai-assistant` module now resolves its `scope` var each time it uses it — minting a thread, listing threads, saving one — rather than once when the page initialises. A scope operator whose value arrives late, such as one reading state populated by an async request, previously froze as null and partitioned every thread under the same empty scope.

  The module still cannot see a scope that changes while the app is running, because nothing in it can observe an app global moving. The docs now carry the recipe for that case: compare `ai_scope` against your own source of truth in `onMount`, which runs on every visit, and clear the open thread when they differ.

  `list-threads` now takes a `$limit` — the thread list is a sidebar with its own search, not an archive, and the pipeline previously grew with a user's whole history for the scope. The module docs also name the two indexes the threads collection wants, and the TTL index for expiring a thread a fixed time after its last activity: the module does not create them, and nothing breaks without them until the collection is large enough that it hurts.

## 0.31.0

### Minor Changes

- [#186](https://github.com/lowdefy/modules-mongodb/pull/186) [`309a157`](https://github.com/lowdefy/modules-mongodb/commit/309a157e9281ba54f150be7a4647cb3f1ce19db5) Thanks [@Yianni99](https://github.com/Yianni99)! - The `ai-assistant` module's chat now takes app behaviour on four events: `on_before_send`, `on_user_message`, `on_data_part` and `on_feedback`. Thread persistence and titling stay the module's own, but an app can now refuse a send before the model is called (a daily question cap, an entitlement check), keep its own record of what was asked, read custom data parts the agent streams, and handle ratings from the feedback control — none of which was possible without forking the chat shell.

  The feedback control remains off unless `message_display` turns it on, and it now has somewhere to send the rating.

## 0.30.0

### Minor Changes

- [#182](https://github.com/lowdefy/modules-mongodb/pull/182) [`98b846f`](https://github.com/lowdefy/modules-mongodb/commit/98b846f5d08136963ef716e331a4ffa8d5714f21) Thanks [@Yianni99](https://github.com/Yianni99)! - New `ai-assistant` module: a persisted, multi-thread chat with one of the app's agents, in two shapes — a docked assistant for any page (an Intercom-style corner launcher and floating panel) and an `embedded` variant that sits inline in a page's own layout. Both share one thread history per (scope, user), with a searchable thread list, in-place rename, delete, and titles generated from each thread's first exchange.

  The module owns the chat shell and the thread lifecycle; it owns no domain knowledge. The agent, what the agent is told about the page (`shared_state`), how threads are partitioned (`scope`), and every string the user reads are vars. Mount `panel` into a page and splice `state` into its `onInit`; a page using `embedded` also splices `enter` (the resume-or-mint chain the panel runs on first open) after it. One shell per page — the two share block ids and state on purpose.

  The plugin package gains what the module rides on:

  - `FloatingPanel` block — a corner launcher + floating panel over a `pointer-events: none` wrapper, so the page behind stays fully clickable (a Drawer masks or reflows it). Children are lazy-mounted then kept mounted across close, and the body publishes its measured height as `--fp-body-height` for children that must fill it exactly.
  - `AiText` connection with a `GenerateChatTitle` request — names a thread from the first exchange (question AND reply) over the Vercel AI Gateway. An agent's own `generateTitle` sees only the opening message, which behind welcome suggestion prompts is one of a handful of canned strings, so every thread comes out with the same name. Best-effort: every failure returns `title: null` and the caller keeps its provisional title.
