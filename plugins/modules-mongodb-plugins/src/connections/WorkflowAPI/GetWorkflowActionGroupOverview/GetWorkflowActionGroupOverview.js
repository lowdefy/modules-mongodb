import createEngineContext from '../../shared/phases/createEngineContext.js';
import findDocs from '../../mongo/findDocs.js';
import { computeAllowed, collapseLink } from '../../shared/render/resolveActionAccess.js';

/**
 * GetWorkflowActionGroupOverview — server-side replacement for the
 * get-action-group-overview.yaml aggregation (Part 46 task 4).
 *
 * Reads a single workflow by _id, joins actions for a specific action_group,
 * applies per-user access filtering, sorts with not-required-sinks-last,
 * and enriches with display config. Collapses group to null when the workflow
 * doesn't exist, has no visible actions, or the group is unknown.
 *
 * Params: { workflow_id, group_id }
 *
 * Response: { workflow, group, actions }
 *   workflow: { ...doc, title, entity_link, form_data (pruned) }
 *   group: { id, status, summary, title, icon } | null
 *   actions: [ { type, status, message, link, allowed } ]
 */
async function GetWorkflowActionGroupOverview(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { workflow_id, group_id } = params;
  const app_name = connection.app_name;
  const userRoles = context.user?.apps?.[app_name]?.roles;
  const workflowsCollection = connection.workflowsCollection ?? 'workflows';
  const actionsCollection = connection.actionsCollection ?? 'actions';
  const entities = connection.entities ?? {};

  // ── Load: the workflow doc ──
  const [wfDoc] = await findDocs({
    mongoDb,
    collection: workflowsCollection,
    query: { _id: workflow_id },
  });

  if (!wfDoc) {
    return { workflow: null, group: null, actions: [] };
  }

  const wfConfig = (workflowsConfig ?? []).find((wc) => wc.type === wfDoc.workflow_type);
  const wfActionsConfig = wfConfig?.actions ?? [];

  // ── Load: actions for this workflow in this group only ──
  const rawActions = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { workflow_id, action_group: group_id },
  });

  // ── Access filter + link collapse ──
  const visibleActions = [];
  for (const action of rawActions) {
    const allowed = computeAllowed({ access: action.access, app_name, userRoles });
    if (!allowed.view && !allowed.edit && !allowed.review && !allowed.error) {
      continue; // drop: no verb accessible
    }
    const link = collapseLink({ links: action[app_name]?.links, allowed });
    const message = action[app_name]?.message ?? null;
    const status = action.status?.[0]?.stage ?? null;
    visibleActions.push({ action, allowed, link, message, status });
  }

  // ── Sort: not-required sinks last, then by sort_order, then created.timestamp ──
  visibleActions.sort((a, b) => {
    const aNotRequired = a.status === 'not-required' ? 1 : 0;
    const bNotRequired = b.status === 'not-required' ? 1 : 0;
    if (aNotRequired !== bNotRequired) return aNotRequired - bNotRequired;
    const aSort = aNotRequired ? 1 : (a.action.sort_order ?? 0);
    const bSort = bNotRequired ? 1 : (b.action.sort_order ?? 0);
    if (aSort !== bSort) return aSort - bSort;
    const aTs = a.action.created?.timestamp ?? 0;
    const bTs = b.action.created?.timestamp ?? 0;
    return aTs < bTs ? -1 : aTs > bTs ? 1 : 0;
  });

  // ── Build action cards ──
  const actionCards = visibleActions.map(({ action, allowed, link, message, status }) => {
    return {
      type: action.type,
      status,
      message,
      link,
      allowed,
    };
  });

  // ── Prune form_data to view-visible actions ──
  const visibleKeys = new Set();
  for (const { action } of visibleActions) {
    visibleKeys.add(action.type);
    if (action.key != null) {
      visibleKeys.add(`${action.type}.${action.key}`);
    }
  }
  const rawFormData = wfDoc.form_data ?? {};
  const prunedFormData = {};
  for (const [k, v] of Object.entries(rawFormData)) {
    if (visibleKeys.has(k)) {
      prunedFormData[k] = v;
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

  // ── Group collapse logic (mirrors the original aggregation's :return) ──
  // group is null when: no visible actions, OR the group_id is not found
  // in the workflow doc's groups array.
  if (visibleActions.length === 0) {
    return { workflow, group: null, actions: [] };
  }

  // Find the runtime group entry from the workflow doc (status/summary).
  const wfGroupEntry = (wfDoc.groups ?? []).find((g) => g.id === group_id);
  if (!wfGroupEntry) {
    return { workflow, group: null, actions: actionCards };
  }

  // Find display config for this group from workflowConfig.
  const configGroups = wfConfig?.action_groups ?? [];
  const configGroup = configGroups.find((g) => g.id === group_id);
  const groupTitle = configGroup?.title ?? null;
  const groupIcon = configGroup?.icon ?? null;

  const group = {
    id: wfGroupEntry.id,
    status: wfGroupEntry.status ?? null,
    summary: wfGroupEntry.summary ?? null,
    title: groupTitle,
    icon: groupIcon,
    // no link — back-nav is entity_link (per task spec)
  };

  return { workflow, group, actions: actionCards };
}

GetWorkflowActionGroupOverview.schema = {};
GetWorkflowActionGroupOverview.meta = {
  checkRead: false,
  checkWrite: false,
};

export default GetWorkflowActionGroupOverview;
