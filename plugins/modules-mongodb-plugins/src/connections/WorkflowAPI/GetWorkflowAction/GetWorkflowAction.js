import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
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
 *     assignees, assignee_docs, entity: { connection_id, id }, created, updated,
 *     entity_link,          // { pageId, urlQuery, title } from the workflow config's `entity` block, or null
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

async function GetWorkflowAction(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { action_id } = params;
  const app_name = connection.app_name;
  const userRoles = context.user?.roles;
  const workflowsCollection = connection.workflowsCollection ?? "workflows";
  const actionsCollection = connection.actionsCollection ?? "actions";
  const contactsCollection = connection.contactsCollection ?? "user-contacts";

  // ── Step 1: Read the action doc ──
  const [action] = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { _id: action_id },
  });

  // ── Step 3: Task guard ──
  // Missing doc or workflow_id == null → null (task-kind docs have no FSM).
  if (!action || action.workflow_id == null) {
    return null;
  }

  // ── Step 4: Access gate ──
  const allowed = computeAllowed({
    access: action.access,
    app_name,
    userRoles,
  });
  if (!allowed.view) {
    return null;
  }

  // ── Step 2b: Resolve workflowConfig + actionConfig ──
  const wfConfig = (workflowsConfig ?? []).find(
    (wc) => wc.type === action.workflow_type,
  );
  const actionConfig =
    (wfConfig?.actions ?? []).find((ac) => ac.type === action.type) ?? {};

  // ── Step 5: Button resolution ──
  const stage = action.status?.[0]?.stage ?? null;
  const buttons = resolveButtons({
    stage,
    allowed,
    allow_not_required: actionConfig.allow_not_required,
  });

  // ── Step 2c: Read the parent workflow doc (for form_data + workflow_closed) ──
  const [wfDoc] = await findDocs({
    mongoDb,
    collection: workflowsCollection,
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
            collection: contactsCollection,
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

  // ── Entity link (mirrors GetWorkflowOverview) — resolved from the workflow
  //    config's `entity` block (by action.workflow_type) so submit/back nav can
  //    return to the entity page. Null when the workflow type has no config or
  //    no `entity` block.
  const entityConfig = wfConfig?.entity;
  const entity_link = entityConfig
    ? {
        pageId: entityConfig.page_id,
        urlQuery: { [entityConfig.id_query_key]: action.entity.id },
        title: entityConfig.title ?? null,
      }
    : null;

  // ── Step 6: Curated envelope (explicit allowlist — no spread of raw doc) ──
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
    description: action.description ?? null,
    due_date: action.due_date ?? null,
    assignees: action.assignees ?? null,
    assignee_docs,
    entity: {
      connection_id: action.entity?.connection_id ?? null,
      id: action.entity?.id ?? null,
    },
    entity_link,
    created: action.created ?? null,
    updated: action.updated ?? null,
    // Display copy
    required_after_close,
    message,
    // Form-field values (from parent workflow, not the action doc)
    form_values,
    // Resolved fields
    allowed,
    buttons,
    workflow_closed,
  };
}

GetWorkflowAction.schema = {};
GetWorkflowAction.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetWorkflowAction;
