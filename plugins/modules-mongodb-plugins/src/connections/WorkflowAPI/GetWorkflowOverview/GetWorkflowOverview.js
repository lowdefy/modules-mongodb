import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import {
  computeAllowed,
  collapseLink,
} from "../../shared/render/resolveActionAccess.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";

/**
 * GetWorkflowOverview — server-side replacement for the get-workflow-overview.yaml
 * aggregation (Part 46 task 4).
 *
 * Reads a single workflow by _id, joins its actions in declaration order
 * (group position in action_groups[], then action position in actions[]),
 * applies per-user access filtering, resolves links, enriches with display config,
 * groups the cards by action_group, and prunes form_data to view-visible actions only.
 *
 * Params: { workflow_id }
 *
 * Response: { workflow, groups }
 *   workflow: { ...doc, title, entity_link, form_data (pruned) }
 *   groups: [ { id, order, title, icon, actions: [...] } ]  (declaration order)
 *     action card: { type, key, status, message, link, allowed, form_meta }
 */
async function GetWorkflowOverview(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { workflow_id } = params;
  const app_name = connection.app_name;
  const entry_id = connection.entry_id;
  const userRoles = context.user?.roles;
  const workflowsCollection = connection.workflowsCollection ?? "workflows";
  const actionsCollection = connection.actionsCollection ?? "actions";
  const entities = connection.entities ?? {};

  // ── Load: the workflow doc ──
  const [wfDoc] = await findDocs({
    mongoDb,
    collection: workflowsCollection,
    query: { _id: workflow_id },
  });

  if (!wfDoc) {
    return { workflow: null, groups: [] };
  }

  const wfConfig = (workflowsConfig ?? []).find(
    (wc) => wc.type === wfDoc.workflow_type,
  );

  // ── Load: all actions for this workflow ──
  const rawActions = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { workflow_id },
  });

  // ── Access filter + link collapse ──
  const visibleActions = [];
  for (const action of rawActions) {
    const allowed = computeAllowed({
      access: action.access,
      app_name,
      userRoles,
    });
    if (!allowed.view && !allowed.edit && !allowed.review && !allowed.error) {
      continue; // drop: no verb accessible
    }
    const link = collapseLink({ links: action[app_name]?.links, allowed });
    const message = action[app_name]?.message ?? null;
    const status = action.status?.[0]?.stage ?? null;
    visibleActions.push({ action, allowed, link, message, status });
  }

  // ── Sort: declaration order (group, not-required sink, action, key, _id) ──
  const compareOrder = makeWorkflowOrderComparator(workflowsConfig);
  visibleActions.sort((a, b) => compareOrder(a.action, b.action));

  // ── Build action cards, grouped by action_group ──
  // form_meta comes from the validated action config (the workflowConfig.actions entry).
  // The group id is stamped on each action doc (planActionTransition); the group's
  // display config (title, icon) lives in the workflow config's action_groups[].
  // Mirrors GetEntityWorkflows' grouping so the overview renders the same shape.
  const wfActionsConfig = wfConfig?.actions ?? [];
  function findActionConfig(type) {
    return wfActionsConfig.find((c) => c.type === type);
  }

  const configGroups = wfConfig?.action_groups ?? [];
  const groupOrderMap = new Map(configGroups.map((g, i) => [g.id, i]));

  // Collect cards per group. visibleActions is already in declaration order, so
  // first-seen insertion order already matches config order; the explicit sort
  // below keeps null/unseen groups deterministic at the bottom.
  const groupMap = new Map(); // String(group_id) → { group_id, actions: [card] }
  for (const { action, allowed, link, message, status } of visibleActions) {
    const groupId = action.action_group ?? null;
    const groupIdKey = String(groupId);
    if (!groupMap.has(groupIdKey)) {
      groupMap.set(groupIdKey, { group_id: groupId, actions: [] });
    }
    const actionConfig = findActionConfig(action.type);
    groupMap.get(groupIdKey).actions.push({
      type: action.type,
      key: action.key ?? null,
      status,
      message,
      link,
      allowed,
      form_meta: actionConfig?.form_meta ?? null,
    });
  }

  // Build group entries with display config from wfConfig; unseen / null groups
  // sort after all declared groups, stably.
  let unseenInsertionIndex = 0;
  const groups = [];
  for (const [groupIdKey, { group_id, actions: groupActions }] of groupMap) {
    let order;
    if (groupOrderMap.has(groupIdKey)) {
      order = groupOrderMap.get(groupIdKey);
    } else {
      order = configGroups.length + unseenInsertionIndex;
      unseenInsertionIndex += 1;
    }
    const configGroup = configGroups.find((g) => g.id === group_id);
    groups.push({
      id: group_id,
      order,
      title: configGroup?.title ?? null,
      icon: configGroup?.icon ?? null,
      actions: groupActions,
    });
  }
  groups.sort((a, b) => a.order - b.order);

  // ── Prune form_data to view-visible actions ──
  // form_data structure (per planFormDataMerge):
  //   unkeyed action: form_data[type] = { ...values }
  //   keyed action:   form_data[type] = { [key]: { ...values }, [key2]: { ...values } }
  //
  // For unkeyed visible actions → keep form_data[type] whole.
  // For keyed visible actions → keep only the form_data[type][key] slices for
  //   visible keys; rebuild the nested object with just those keys so denied
  //   keyed siblings do not ship.
  const rawFormData = wfDoc.form_data ?? {};

  // Collect visible keys per type.
  // visibleKeysByType: type → Set<key> | 'unkeyed' sentinel
  const visibleKeysByType = new Map();
  for (const { action } of visibleActions) {
    const type = action.type;
    const key = action.key ?? null;
    if (key == null) {
      // Unkeyed: keep the whole type slice.
      visibleKeysByType.set(type, "unkeyed");
    } else {
      // Keyed: only if no unkeyed instance already claimed the whole slice.
      if (
        !visibleKeysByType.has(type) ||
        visibleKeysByType.get(type) !== "unkeyed"
      ) {
        if (!visibleKeysByType.has(type)) {
          visibleKeysByType.set(type, new Set());
        }
        visibleKeysByType.get(type).add(key);
      }
    }
  }

  const prunedFormData = {};
  for (const [type, sentinel] of visibleKeysByType) {
    if (!(type in rawFormData)) continue;
    if (sentinel === "unkeyed") {
      // Unkeyed action: keep the whole form_data[type] value.
      prunedFormData[type] = rawFormData[type];
    } else {
      // Keyed action: rebuild form_data[type] with only visible key slices.
      const typeSlice = rawFormData[type];
      if (
        typeSlice != null &&
        typeof typeSlice === "object" &&
        !Array.isArray(typeSlice)
      ) {
        const filtered = {};
        for (const k of sentinel) {
          if (k in typeSlice) {
            filtered[k] = typeSlice[k];
          }
        }
        if (Object.keys(filtered).length > 0) {
          prunedFormData[type] = filtered;
        }
      }
    }
  }

  // ── Workflow title + entity_link ──
  const title = wfConfig?.title ?? null;
  const entityConfig = entities[wfDoc.entity_collection];
  const entity_link = entityConfig
    ? {
        pageId: entityConfig.page_id,
        urlQuery: { [entityConfig.id_query_key]: wfDoc.entity_id },
        title: entityConfig.title ?? null,
      }
    : null;

  const workflow = {
    ...wfDoc,
    title,
    entity_link,
    form_data: prunedFormData,
  };

  return { workflow, groups };
}

GetWorkflowOverview.schema = {};
GetWorkflowOverview.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetWorkflowOverview;
