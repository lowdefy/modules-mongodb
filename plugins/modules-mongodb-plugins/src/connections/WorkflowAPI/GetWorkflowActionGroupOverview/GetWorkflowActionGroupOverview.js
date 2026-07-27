import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import collectionNames from "../../shared/collectionNames.js";
import findWorkflowConfig from "../../shared/findWorkflowConfig.js";
import resolveEntityData from "../../shared/render/resolveEntityData.js";
import { selectVisibleActions } from "../../shared/render/resolveActionAccess.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";
import buildEntityLink from "../../shared/render/buildEntityLink.js";
import pruneFormData from "../../shared/render/pruneFormData.js";
import summarizeStatuses from "../../shared/render/summarizeStatuses.js";
import deriveGroupStatus from "../../shared/phases/planners/deriveGroupStatus.js";

/**
 * GetWorkflowActionGroupOverview — server-side replacement for the
 * get-action-group-overview.yaml aggregation (Part 46 task 4).
 *
 * Reads a single workflow by _id, joins actions for a specific action_group,
 * applies per-user access filtering, sorts with not-required-sinks-last,
 * and enriches with display config. Collapses group to null when the workflow
 * doesn't exist, has no visible actions, or the group is unknown.
 *
 * Part 66: the group's `status`/`summary` are derived on read from the group's
 * action docs (`deriveGroupStatus` / `summarizeStatuses`, over ALL of the
 * group's actions — an objective property), and the existence guard keys off
 * the declared config group instead of the dropped runtime `groups[]` cache.
 *
 * Params: { workflow_id, group_id }
 *
 * Response: { workflow, group, actions }
 *   workflow: { ...doc, title, entity_link, form_data (pruned) }
 *   group: { id, status, summary, title, icon } | null
 *     summary: { counts: { <stage>: n, ... }, total }
 *   actions: [ { type, status, message, link, allowed } ]
 */
async function GetWorkflowActionGroupOverview(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { workflow_id, group_id } = params;
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
    return { workflow: null, group: null, actions: [] };
  }

  const wfConfig = findWorkflowConfig(workflowsConfig, wfDoc.workflow_type);
  const wfActionsConfig = wfConfig?.actions ?? [];

  // ── Load: actions for this workflow in this group only ──
  const rawActions = await findDocs({
    mongoDb,
    collection: collections.actions,
    query: { workflow_id, action_group: group_id },
  });

  // ── Access filter + link collapse, then declaration-order sort ──
  const visibleActions = selectVisibleActions({
    actions: rawActions,
    app_name,
    userRoles,
  });
  const compareOrder = makeWorkflowOrderComparator();
  visibleActions.sort((a, b) => compareOrder(a.action, b.action));

  // ── Build action cards ──
  // form_meta comes from the validated action config (form-kind actions only).
  const actionCards = visibleActions.map(
    ({ action, allowed, link, message, status }) => ({
      type: action.type,
      key: action.key ?? null,
      status,
      message,
      link,
      allowed,
      form_meta:
        wfActionsConfig.find((c) => c.type === action.type)?.form_meta ?? null,
    }),
  );

  // ── Workflow title + entity_link ──
  // Part 26: lift the instance `name` onto entity_link from the host's
  // entity.data routine (server-side; null when no routine / it throws), uniform
  // with the action and overview pages. No `entity` object — chrome only.
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
  };

  // ── Group collapse logic (mirrors the original aggregation's :return) ──
  // group is null when: no visible actions, OR the group_id is not a declared
  // config group. Part 66: the existence guard keys off the declared config
  // group (the doc no longer carries a runtime groups[] cache) — behaviour-
  // equivalent, since groups[] was only ever populated for declared groups.
  if (visibleActions.length === 0) {
    return { workflow, group: null, actions: [] };
  }

  const configGroup = (wfConfig?.action_groups ?? []).find(
    (g) => g.id === group_id,
  );
  if (!configGroup) {
    return { workflow, group: null, actions: actionCards };
  }

  // status/summary derived from ALL of the group's actions. rawActions is the
  // full group set (queried by workflow_id + action_group), not the visible
  // subset — progress is objective (Part 66).
  const group = {
    id: group_id,
    status: deriveGroupStatus(rawActions),
    summary: summarizeStatuses(rawActions),
    title: configGroup.title ?? null,
    icon: configGroup.icon ?? null,
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
