import findDocs from "../../mongo/findDocs.js";
import collectionNames from "../../shared/collectionNames.js";
import findWorkflowConfig from "../../shared/findWorkflowConfig.js";
import parseNunjucks from "../../shared/render/parseNunjucks.js";
import resolveEntityData from "../../shared/render/resolveEntityData.js";
import buildEntityLink from "../../shared/render/buildEntityLink.js";
import {
  computeAllowed,
  resolveButtons,
} from "../../shared/render/resolveActionAccess.js";

/**
 * GetWorkflowAction — server-side detail-page read method (Part 46 task 5).
 *
 * Reads a single workflow action by _id, resolves access + button visibility
 * server-side, and returns a curated envelope ready for the detail pages to
 * render without any client-side computation.
 *
 * Params: { action_id }
 *
 * Response: envelope object (single object, not an array — unlike the old
 * get_action.yaml aggregation which returned an array; task 7/10 must update
 * client reads accordingly: `_request: get_action.0` → `_request: get_workflow_action`).
 *
 *   {
 *     _id, type, workflow_type, workflow_id, kind, key, status, action_group, description, due_date,
 *     assignees, assignee_docs, created, updated,
 *     entity,               // { ...entity.data routine result, id } — host fields + the always-present instance id
 *     entity_link,          // { pageId, urlQuery, title, name } from the workflow config's `entity` block (name from the routine), or null
 *     required_after_close, message,
 *     form_values,          // form-field values from workflow.form_data (allowlisted)
 *     allowed,              // { view, edit, review, error }
 *     buttons,              // { submit, approve, request_changes, resolve_error, progress, not_required }
 *     workflow_closed,      // boolean: parent workflow completed or cancelled
 *   }
 *
 * Returns null when: the action doc is missing, workflow_id is null (task-kind
 * doc with no FSM), or allowed.view is false (access gate).
 *
 * `workflow_type` is shipped so the action detail pages can build the
 * per-workflow submit endpoint id (`{workflow_type}-submit`) at runtime.
 * Other raw engine internals are NOT shipped: access, metadata,
 * [slug].links, tracker, child_* are all excluded from the response.
 */

// Structural component types that may contain nested form fields.
const STRUCTURAL_COMPONENTS = new Set([
  "controlled_list",
  "section",
  "box",
  "label",
  "file_upload",
]);

/**
 * Collect the leaf form-field keys from a form array (same recursion as
 * makeWorkflowsConfig.js's `describeForm`/`toMetadataNode`). Structural
 * components recurse into their `form` sub-array; all other entries yield
 * their `key`. Structural components also yield their own `key` when present
 * (e.g. `file_upload` is structural but is itself a persisted leaf field;
 * `controlled_list` owns the array value at its key). Returns a Set<string>
 * of allowlisted dotted state-path keys (e.g. `'form.po_number'`).
 */
function collectFormKeys(formArray) {
  const keys = new Set();
  for (const entry of formArray ?? []) {
    if (entry.component && STRUCTURAL_COMPONENTS.has(entry.component)) {
      // Collect the structural entry's own key when present (e.g. file_upload,
      // controlled_list — both are persisted at their own key).
      if (entry.key != null) {
        keys.add(entry.key);
      }
      // Also recurse into nested form entries.
      for (const k of collectFormKeys(entry.form ?? [])) {
        keys.add(k);
      }
    } else if (entry.key != null) {
      keys.add(entry.key);
    }
  }
  return keys;
}

/**
 * Map a dotted state-path key authored in form_meta (e.g. `'form.po_number'`,
 * `'form.address.street'`) to the bare property name stored in the persisted
 * `form_data[type]` slice (e.g. `'po_number'`, `'address'`).
 *
 * The edit template primes `state.form = form_data[type]` and submits
 * `form: _state: form`, so state paths must start with `'form.'`. The slice
 * stores the first path segment after that prefix — nested sub-paths collapse
 * to their top-level container key (e.g. `form.address.street` → `address`).
 * Keys not starting with `'form.'` are not persisted and contribute nothing.
 */
function formKeyToSliceProp(dotPath) {
  if (!dotPath.startsWith("form.")) return null;
  const rest = dotPath.slice("form.".length);
  const dot = rest.indexOf(".");
  return dot === -1 ? rest : rest.slice(0, dot);
}

/**
 * Allowlist-project a form-data slice by a set of valid dotted state-path keys.
 * Each key is mapped to its slice property name before lookup.
 * Returns an object containing only the matching properties.
 */
function projectFormSlice(slice, allowedKeys) {
  if (slice == null || typeof slice !== "object" || Array.isArray(slice)) {
    return {};
  }
  const projected = {};
  const seen = new Set();
  for (const key of allowedKeys) {
    const prop = formKeyToSliceProp(key);
    if (prop == null || seen.has(prop)) continue;
    seen.add(prop);
    if (prop in slice) {
      projected[prop] = slice[prop];
    }
  }
  return projected;
}

async function GetWorkflowAction(context) {
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { action_id } = params;
  const app_name = connection.app_name;
  const userRoles = context.user?.roles;
  const collections = collectionNames(connection);

  // ── Read the action doc ──
  const [action] = await findDocs({
    mongoDb,
    collection: collections.actions,
    query: { _id: action_id },
  });

  // ── Task guard ──
  // Missing doc or workflow_id == null → null (task-kind docs have no FSM).
  if (!action || action.workflow_id == null) {
    return null;
  }

  // ── Access gate ──
  const allowed = computeAllowed({
    access: action.access,
    app_name,
    userRoles,
  });
  if (!allowed.view) {
    return null;
  }

  // ── Resolve workflowConfig + actionConfig ──
  const wfConfig = findWorkflowConfig(workflowsConfig, action.workflow_type);
  const actionConfig =
    (wfConfig?.actions ?? []).find((ac) => ac.type === action.type) ?? {};

  // ── Button resolution ──
  const stage = action.status?.[0]?.stage ?? null;
  const buttons = resolveButtons({
    stage,
    allowed,
    allow_not_required: actionConfig.allow_not_required,
  });

  // ── Read the parent workflow doc (for form_data + workflow_closed) ──
  const [wfDoc] = await findDocs({
    mongoDb,
    collection: collections.workflows,
    query: { _id: action.workflow_id },
  });

  // ── Workflow closed flag ──
  const wfStage = wfDoc?.status?.[0]?.stage ?? null;
  const workflow_closed = wfStage === "completed" || wfStage === "cancelled";

  // ── Assignee display docs (Part 24) — the universal-fields display mode
  //    renders one avatar per assignee, which needs user docs, not ids.
  //    user-contacts._id is a string (uuid), so the $in matches without
  //    coercion. Empty array when the action has no assignees.
  const assigneeIds = action.assignees ?? [];
  const assignee_docs =
    assigneeIds.length > 0
      ? (
          await findDocs({
            mongoDb,
            collection: collections.contacts,
            query: { _id: { $in: assigneeIds } },
          })
        ).map((d) => ({
          _id: d._id,
          profile: { name: d.profile?.name, picture: d.profile?.picture },
        }))
      : [];

  // ── Form-field values (allowlisted by validated form keys) ──
  // Collect valid keys from all three form arrays (form, form_review, form_error).
  // For check-kind (no form), all sets are empty → form_values is {}.
  const formMeta = actionConfig.form_meta ?? null;
  const formKeys = collectFormKeys(formMeta?.form);
  const formReviewKeys = collectFormKeys(formMeta?.form_review);
  const formErrorKeys = collectFormKeys(formMeta?.form_error);
  const allFormKeys = new Set([
    ...formKeys,
    ...formReviewKeys,
    ...formErrorKeys,
  ]);

  let form_values = {};
  if (allFormKeys.size > 0 && wfDoc) {
    const rawFormData = wfDoc.form_data ?? {};
    const typeSlice = rawFormData[action.type];

    if (action.key != null) {
      // Keyed action: form_data[type][key]
      const keyedSlice =
        typeSlice != null &&
        typeof typeSlice === "object" &&
        !Array.isArray(typeSlice)
          ? typeSlice[action.key]
          : null;
      form_values = projectFormSlice(keyedSlice, allFormKeys);
    } else {
      // Unkeyed action: form_data[type]
      form_values = projectFormSlice(typeSlice, allFormKeys);
    }
  }

  // ── Entity data (Part 26) — call the host's `entity.data` routine via the
  //    module-generated {type}-entity-data InternalApi (server-side, same user).
  //    Returns the host-shaped object (reserved `name` for chrome + host fields),
  //    or null when no routine is declared / it throws / the entity is missing.
  const entityId = action.entity?.id ?? null;
  const entityData = await resolveEntityData(context, wfConfig, entityId);

  // ── Entity link (mirrors GetWorkflowOverview) — resolved from the workflow
  //    config's `entity` block (by action.workflow_type) so submit/back nav can
  //    return to the entity page. The instance `name` is lifted off the routine
  //    result onto the chrome (falls back to the type label when null). Null when
  //    the workflow type has no config or no `entity` block.
  const entity_link = buildEntityLink({
    entityConfig: wfConfig?.entity,
    entityId,
    name: entityData?.name ?? null,
  });

  // ── Authored description (Part 64) — rendered at read time from config ──
  // The action body `description` is workflow-author-authored config (lives on
  // `actionConfig`, NOT the action doc). It is rendered fresh on every read via
  // nunjucks against the action instance — same context shape `renderStatusMap`
  // builds (`{ ...action, ...metadata }`) — so a templated description can never
  // go stale (there is no create-time materialisation to drift). Null when the
  // author declared none.
  const description =
    actionConfig.description != null
      ? parseNunjucks(actionConfig.description, {
          ...action,
          ...(action.metadata ?? {}),
        })
      : null;

  // ── Changes-requested brief (Part 62) — the latest request-changes comment ──
  // When the action sits in `changes-required`, surface the reviewer's brief so
  // the reworker sees "what to fix" without hunting the History timeline. The
  // comment lives once on the request_changes event (Part 33), so this reads the
  // event — never the action doc — and inherits Part 61's app-scoping for free:
  // the projection keys off the CALLING connection's app_name, so an `internal`
  // note resolves to null for an app that can't see it.
  //
  // Read contract: the latest `action-request_changes` event for this action
  // overall (sort date desc, limit 1) — then this app's bucket on it. If that
  // latest event has no brief in my bucket, `changes_requested` is null (the
  // callout is omitted; the status pill still conveys the state). Skipped — and
  // null — in every other stage.
  let changes_requested = null;
  if (stage === "changes-required") {
    const [evt] = await findDocs({
      mongoDb,
      collection: collections.events,
      query: { type: "action-request_changes", action_ids: action._id },
      options: {
        sort: { date: -1 },
        limit: 1,
        projection: { [`${app_name}.description`]: 1 },
      },
    });
    const html = evt?.[app_name]?.description ?? null;
    // Defensive (D3): request-changes comments are text-only (inline files are
    // disabled on the input), but legacy image-only rows stored TipTap's empty
    // doc marker `<p></p>` with the content in `fileList` (not read here). Treat
    // empty/whitespace-only html as "no brief" so the callout's non-null gate
    // never renders a present-but-blank brief.
    changes_requested = html?.replace(/<[^>]*>/g, "").trim() ? html : null;
  }

  // ── Curated envelope (explicit allowlist — no spread of raw doc) ──
  const message = action[app_name]?.message ?? null;
  const required_after_close = actionConfig.required_after_close ?? null;

  return {
    // Engine fields
    _id: action._id,
    type: action.type,
    workflow_type: action.workflow_type,
    workflow_id: action.workflow_id,
    kind: action.kind,
    key: action.key ?? null,
    status: action.status,
    action_group: action.action_group ?? null,
    // Authored config field, rendered at read time (not the action doc).
    description,
    due_date: action.due_date ?? null,
    assignees: action.assignees ?? null,
    assignee_docs,
    // Part 26: the entity object the action page's slot + DataDescriptions read.
    // The host routine result merged with the always-present entity id — id is
    // injected LAST so the instance id always wins over any host-returned `id`.
    // Degrades to `{ id }` when no routine is declared / it threw.
    entity: { ...(entityData ?? {}), id: entityId },
    entity_link,
    created: action.created ?? null,
    updated: action.updated ?? null,
    // Display copy
    required_after_close,
    message,
    // Latest request-changes brief (Part 62) — null outside `changes-required`,
    // and null when the latest such event has no brief in the calling app's
    // bucket (Part 61 app-scoping). The callout binds and gates on this.
    changes_requested,
    // Form-field values (from parent workflow, not the action doc)
    form_values,
    // Resolved fields
    allowed,
    buttons,
    workflow_closed,
  };
}

export default GetWorkflowAction;
