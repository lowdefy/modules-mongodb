import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import entityPageLink from "../../shared/render/entityPageLink.js";
import resolveEntityData from "../../shared/render/resolveEntityData.js";
import { collapseLink } from "../../shared/render/resolveActionAccess.js";
import {
  pruneFormData,
  viewableActions,
} from "../../shared/render/viewableFormData.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";
import summarizeStatuses from "../../shared/render/summarizeStatuses.js";
import deriveGroupStatus from "../../shared/phases/planners/deriveGroupStatus.js";

/**
 * GetWorkflowOverview — server-side replacement for the get-workflow-overview.yaml
 * aggregation (Part 46 task 4).
 *
 * Reads a single workflow by _id, joins its actions in declaration order
 * (group position in action_groups[], then action position in actions[]),
 * applies per-user access filtering, resolves links, enriches with display config,
 * groups the cards by action_group, and prunes form_data to view-visible actions only.
 *
 * Part 66: the workflow-level and per-group progress `summary` (and per-group
 * `status`) are derived on read from the action docs via `summarizeStatuses` /
 * `deriveGroupStatus`, over ALL raw actions (an objective property, independent
 * of per-viewer access), replacing the dropped denormalised cache.
 *
 * Params: { workflow_id }
 *
 * Response: { workflow, groups }
 *   workflow: { ...doc, title, entity_link, form_data (pruned), summary }
 *     summary: { counts: { <stage>: n, ... }, total }
 *   groups: [ { id, order, title, icon, status, summary, actions: [...] } ]  (declaration order)
 *     action card: { type, key, status, message, link, allowed, form_meta }
 */
async function GetWorkflowOverview(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig, tenant } = context;
  const { workflow_id } = params;
  const slug = connection.slug;
  const entry_id = connection.entry_id;
  const userRoles = context.user?.roles;
  const workflowsCollection = connection.workflowsCollection ?? "workflows";
  const actionsCollection = connection.actionsCollection ?? "actions";

  // ── Load: the workflow doc ──
  const [wfDoc] = await findDocs({
    mongoDb,
    collection: workflowsCollection,
    query: { _id: workflow_id },
    tenant,
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
    tenant,
  });

  // ── Access filter + link collapse ──
  const visibleActions = viewableActions({
    actions: rawActions,
    slug,
    userRoles,
  }).map(({ action, allowed }) => ({
    action,
    allowed,
    link: collapseLink({ links: action[slug]?.links, allowed }),
    message: action[slug]?.message ?? null,
    status: action.status?.[0]?.stage ?? null,
  }));

  // ── Sort: declaration order (group, not-required sink, action, key, _id) ──
  const compareOrder = makeWorkflowOrderComparator();
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
    // status/summary count ALL raw actions in the group (not the visible subset)
    // — progress is objective (Part 66).
    const groupRawActions = rawActions.filter(
      (act) => (act.action_group ?? null) === group_id,
    );
    groups.push({
      id: group_id,
      order,
      title: configGroup?.title ?? null,
      icon: configGroup?.icon ?? null,
      status: deriveGroupStatus(groupRawActions),
      summary: summarizeStatuses(groupRawActions),
      actions: groupActions,
    });
  }
  groups.sort((a, b) => a.order - b.order);

  // ── Prune form_data to view-visible actions ──
  const prunedFormData = pruneFormData({
    formData: wfDoc.form_data,
    actions: visibleActions.map(({ action }) => action),
  });

  // ── Workflow title + entity_link ──
  // Part 26: the instance `name` is lifted onto entity_link from the host's
  // entity.data routine (called server-side; null when no routine / it throws),
  // so the overview breadcrumb/back-link shows the instance name uniformly with
  // the action pages. The overview surfaces no `entity` object — only chrome.
  const title = wfConfig?.title ?? null;
  const entityConfig = wfConfig?.entity;
  const entityData = await resolveEntityData(
    context,
    wfConfig,
    wfDoc.entity?.id ?? null,
  );
  const entity_link = entityConfig
    ? {
        ...entityPageLink(entityConfig, wfDoc.entity.id),
        title: entityConfig.title ?? null,
        name: entityData?.name ?? null,
        // Part 63: the optional entity-list breadcrumb crumb. Runtime-driven
        // overview pages can't bake these like the action page does, so they
        // ride the response and the runtime fragment gates on list_page_id.
        list_page_id: entityConfig.list_page_id ?? null,
        list_title: entityConfig.list_title ?? null,
      }
    : null;

  const workflow = {
    ...wfDoc,
    title,
    entity_link,
    form_data: prunedFormData,
    // Progress summary over ALL raw actions (objective, per-viewer-independent).
    summary: summarizeStatuses(rawActions),
  };

  return { workflow, groups };
}

GetWorkflowOverview.schema = {};
GetWorkflowOverview.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetWorkflowOverview;
