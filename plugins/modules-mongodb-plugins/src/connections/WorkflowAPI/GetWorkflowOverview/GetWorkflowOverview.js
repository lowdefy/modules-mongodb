import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import collectionNames from "../../shared/collectionNames.js";
import findWorkflowConfig from "../../shared/findWorkflowConfig.js";
import resolveEntityData from "../../shared/render/resolveEntityData.js";
import { selectVisibleActions } from "../../shared/render/resolveActionAccess.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";
import buildEntityLink from "../../shared/render/buildEntityLink.js";
import collectActionGroups from "../../shared/render/collectActionGroups.js";
import pruneFormData from "../../shared/render/pruneFormData.js";
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
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { workflow_id } = params;
  const app_name = connection.app_name;
  const userRoles = context.user?.roles;
  const collections = collectionNames(connection);

  // ── Load: the workflow doc ──
  const [wfDoc] = await findDocs({
    mongoDb,
    collection: collections.workflows,
    query: { _id: workflow_id },
  });

  if (!wfDoc) {
    return { workflow: null, groups: [] };
  }

  const wfConfig = findWorkflowConfig(workflowsConfig, wfDoc.workflow_type);

  // ── Load: all actions for this workflow ──
  const rawActions = await findDocs({
    mongoDb,
    collection: collections.actions,
    query: { workflow_id },
  });

  // ── Access filter + link collapse, then declaration-order sort ──
  const visibleActions = selectVisibleActions({
    actions: rawActions,
    app_name,
    userRoles,
  });
  const compareOrder = makeWorkflowOrderComparator();
  visibleActions.sort((a, b) => compareOrder(a.action, b.action));

  // ── Build action cards, grouped by action_group ──
  // form_meta comes from the validated action config (the workflowConfig.actions
  // entry). The group id is stamped on each action doc (planActionTransition);
  // the group's display config (title, icon) lives in the workflow config's
  // action_groups[]. Mirrors GetEntityWorkflows' grouping so the overview
  // renders the same shape. Per-group status/summary count ALL raw actions in
  // the group (not the visible subset) — progress is objective (Part 66).
  const wfActionsConfig = wfConfig?.actions ?? [];
  const groups = collectActionGroups({
    visibleActions,
    configGroups: wfConfig?.action_groups ?? [],
    makeCard: ({ action, allowed, link, message, status }) => ({
      type: action.type,
      key: action.key ?? null,
      status,
      message,
      link,
      allowed,
      form_meta:
        wfActionsConfig.find((c) => c.type === action.type)?.form_meta ?? null,
    }),
  }).map(({ group_id, order, configGroup, cards }) => {
    const groupRawActions = rawActions.filter(
      (act) => (act.action_group ?? null) === group_id,
    );
    return {
      id: group_id,
      order,
      title: configGroup?.title ?? null,
      icon: configGroup?.icon ?? null,
      status: deriveGroupStatus(groupRawActions),
      summary: summarizeStatuses(groupRawActions),
      actions: cards,
    };
  });

  // ── Workflow title + entity_link ──
  // Part 26: the instance `name` is lifted onto entity_link from the host's
  // entity.data routine (called server-side; null when no routine / it throws),
  // so the overview breadcrumb/back-link shows the instance name uniformly with
  // the action pages. The overview surfaces no `entity` object — only chrome.
  const entityData = await resolveEntityData(
    context,
    wfConfig,
    wfDoc.entity?.id ?? null,
  );

  const workflow = {
    ...wfDoc,
    title: wfConfig?.title ?? null,
    entity_link: buildEntityLink({
      entityConfig: wfConfig?.entity,
      entityId: wfDoc.entity?.id ?? null,
      name: entityData?.name ?? null,
      listCrumb: true,
    }),
    // Pruned to view-visible actions — denied slices never ship.
    form_data: pruneFormData({ formData: wfDoc.form_data, visibleActions }),
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
