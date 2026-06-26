import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import {
  computeAllowed,
  collapseLink,
} from "../../shared/render/resolveActionAccess.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";

/**
 * GetEntityWorkflows — server-side replacement for the get-entity-workflows.yaml
 * aggregation (Part 46 task 4).
 *
 * Reads all workflows for a given entity, joins their actions, applies per-user
 * access filtering, groups actions by action_group with not-required-sinks-last
 * ordering, and enriches each workflow + group with display config from
 * workflowsConfig + entities map.
 *
 * Params: { entity_collection, entity_id }
 *
 * Response: { workflows: [...] }
 *   Each workflow: { _id, workflow_type, status, groups: [...], ...doc fields }
 *   Each group: { id, order, title, icon, link, action_group, workflow_type, workflow_id, actions: [...] }
 *   Each action card: { _id, kind, type, status, allowed, message, link }
 */
async function GetEntityWorkflows(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { entity_collection, entity_id } = params;
  const app_name = connection.app_name;
  const entry_id = connection.entry_id;
  const userRoles = context.user?.roles;
  const workflowsCollection = connection.workflowsCollection ?? "workflows";
  const actionsCollection = connection.actionsCollection ?? "actions";
  const entities = connection.entities ?? {};

  // ── Load: all workflows for the entity, sorted by display_order asc, created desc ──
  const workflowDocs = await findDocs({
    mongoDb,
    collection: workflowsCollection,
    query: { entity_collection, entity_id },
    options: { sort: { display_order: 1, "created.timestamp": -1 } },
  });

  if (workflowDocs.length === 0) {
    return { workflows: [] };
  }

  // ── Load: all actions for these workflows ──
  const workflowIds = workflowDocs.map((w) => w._id);
  const allActions = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { workflow_id: { $in: workflowIds } },
  });

  // Index actions by workflow_id for quick lookup.
  const actionsByWorkflowId = new Map();
  for (const action of allActions) {
    const key = String(action.workflow_id);
    if (!actionsByWorkflowId.has(key)) {
      actionsByWorkflowId.set(key, []);
    }
    actionsByWorkflowId.get(key).push(action);
  }

  // Helper: look up workflow config for a given workflow_type.
  function findWorkflowConfig(workflow_type) {
    return (workflowsConfig ?? []).find((wc) => wc.type === workflow_type);
  }

  // Shared declaration-order comparator (resolves config per action).
  const compareOrder = makeWorkflowOrderComparator(workflowsConfig);

  // Helper: build the group-overview page link (matches computeEngineLinks scoped convention).
  function buildGroupLink(workflow_id, group_id) {
    return {
      pageId: `${entry_id}/workflow-group-overview`,
      urlQuery: { workflow_id, group_id },
    };
  }

  const workflows = workflowDocs.map((wfDoc) => {
    const rawActions = actionsByWorkflowId.get(String(wfDoc._id)) ?? [];
    const wfConfig = findWorkflowConfig(wfDoc.workflow_type);

    // ── Access filter + link collapse per action ──
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
    visibleActions.sort((a, b) => compareOrder(a.action, b.action));

    // ── Group actions by action_group ──
    // Preserve declaration order from config's action_groups, then append unseen groups.
    const configGroups = wfConfig?.action_groups ?? [];
    const groupOrderMap = new Map(configGroups.map((g, i) => [g.id, i]));

    // Collect actions per group_id.
    const groupMap = new Map(); // group_id → { actions, firstSeen order }
    for (const { action, allowed, link, message, status } of visibleActions) {
      const groupId = action.action_group ?? null;
      const groupIdKey = String(groupId);
      if (!groupMap.has(groupIdKey)) {
        groupMap.set(groupIdKey, { group_id: groupId, actions: [] });
      }
      groupMap.get(groupIdKey).actions.push({
        _id: action._id,
        kind: action.kind,
        type: action.type,
        status,
        allowed,
        message,
        link,
      });
    }

    // Build group entries with display config from wfConfig.
    // Unseen groups (not in configGroups) get an insertion index so they sort
    // AFTER all declared groups, stably.
    let unseenInsertionIndex = 0;
    const groupEntries = [];
    for (const [groupIdKey, { group_id, actions: groupActions }] of groupMap) {
      let configGroupIndex;
      if (groupOrderMap.has(groupIdKey)) {
        configGroupIndex = groupOrderMap.get(groupIdKey);
      } else {
        // Unseen group: sort after all declared config groups.
        configGroupIndex = configGroups.length + unseenInsertionIndex;
        unseenInsertionIndex += 1;
      }

      // Find the display config for this group from workflowConfig.
      const configGroup = configGroups.find((g) => g.id === group_id);
      const title = configGroup?.title ?? null;
      const icon = configGroup?.icon ?? null;

      // Find the workflow doc's runtime group entry (status/summary).
      const wfGroupEntry = (wfDoc.groups ?? []).find((g) => g.id === group_id);

      const groupLink =
        group_id != null ? buildGroupLink(wfDoc._id, group_id) : null;

      groupEntries.push({
        id: group_id,
        order: configGroupIndex,
        title,
        icon,
        link: groupLink,
        action_group: group_id,
        workflow_type: wfDoc.workflow_type,
        workflow_id: wfDoc._id,
        status: wfGroupEntry?.status ?? null,
        summary: wfGroupEntry?.summary ?? null,
        actions: groupActions,
      });
    }

    // Sort groups by declaration order.
    groupEntries.sort((a, b) => a.order - b.order);

    // ── Workflow title from config ──
    const title = wfConfig?.title ?? null;

    // ── entity_link ──
    const entityConfig = entities[wfDoc.entity_collection];
    const entity_link = entityConfig
      ? {
          pageId: entityConfig.page_id,
          urlQuery: { [entityConfig.id_query_key]: wfDoc.entity_id },
          title: entityConfig.title ?? null,
        }
      : null;

    return {
      ...wfDoc,
      title,
      entity_link,
      groups: groupEntries,
    };
  });

  return { workflows };
}

GetEntityWorkflows.schema = {};
GetEntityWorkflows.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetEntityWorkflows;
