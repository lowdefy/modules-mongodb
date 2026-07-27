import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import collectionNames from "../../shared/collectionNames.js";
import findWorkflowConfig from "../../shared/findWorkflowConfig.js";
import { selectVisibleActions } from "../../shared/render/resolveActionAccess.js";
import { makeWorkflowOrderComparator } from "../../shared/render/compareActionOrder.js";
import buildEntityLink from "../../shared/render/buildEntityLink.js";
import collectActionGroups from "../../shared/render/collectActionGroups.js";
import pruneFormData from "../../shared/render/pruneFormData.js";
import deriveGroupStatus from "../../shared/phases/planners/deriveGroupStatus.js";

/**
 * GetEntityWorkflows — server-side replacement for the get-entity-workflows.yaml
 * aggregation (Part 46 task 4).
 *
 * Reads all workflows for a given entity, joins their actions, applies per-user
 * access filtering, groups actions by action_group with not-required-sinks-last
 * ordering, and enriches each workflow + group with display config from
 * workflowsConfig (including each workflow config's `entity` block).
 *
 * Params: { entity: { connection_id, id } }
 *
 * Response: { workflows: [...] }
 *   Each workflow: { _id, workflow_type, status, groups: [...], ...doc fields }
 *     (form_data is pruned to view-visible actions — same policy as
 *     GetWorkflowOverview, so denied slices never ship)
 *   Each group: { id, order, title, icon, link, action_group, workflow_type, workflow_id, actions: [...] }
 *   Each action card: { _id, kind, type, status, allowed, message, link }
 */
async function GetEntityWorkflows(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, mongoDb, connection, workflowsConfig } = context;
  const { connection_id, id } = params.entity ?? {};
  const app_name = connection.app_name;
  const entry_id = connection.entry_id;
  const userRoles = context.user?.roles;
  const collections = collectionNames(connection);

  // ── Load: all workflows for the entity, sorted by display_order asc, created desc ──
  const workflowDocs = await findDocs({
    mongoDb,
    collection: collections.workflows,
    query: { "entity.connection_id": connection_id, "entity.id": id },
    options: { sort: { display_order: 1, "created.timestamp": -1 } },
  });

  if (workflowDocs.length === 0) {
    return { workflows: [] };
  }

  // ── Load: all actions for these workflows ──
  const workflowIds = workflowDocs.map((w) => w._id);
  const allActions = await findDocs({
    mongoDb,
    collection: collections.actions,
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

  // Shared declaration-order comparator (reads denormalised indices off the doc).
  const compareOrder = makeWorkflowOrderComparator();

  const workflows = workflowDocs.map((wfDoc) => {
    const rawActions = actionsByWorkflowId.get(String(wfDoc._id)) ?? [];
    const wfConfig = findWorkflowConfig(workflowsConfig, wfDoc.workflow_type);

    // ── Access filter + link collapse, then declaration-order sort ──
    const visibleActions = selectVisibleActions({
      actions: rawActions,
      app_name,
      userRoles,
    });
    visibleActions.sort((a, b) => compareOrder(a.action, b.action));

    // ── Group actions by action_group, in config declaration order ──
    // Part 66: each group's runtime `status` is derived on read from ALL of the
    // group's raw actions (objective, per-viewer-independent), replacing the
    // dropped `groups[]` cache.
    const groups = collectActionGroups({
      visibleActions,
      configGroups: wfConfig?.action_groups ?? [],
      makeCard: ({ action, allowed, link, message, status }) => ({
        _id: action._id,
        kind: action.kind,
        type: action.type,
        status,
        allowed,
        message,
        link,
      }),
    }).map(({ group_id, order, configGroup, cards }) => ({
      id: group_id,
      order,
      title: configGroup?.title ?? null,
      icon: configGroup?.icon ?? null,
      // The group-overview page link (matches computeEngineLinks scoped convention).
      link:
        group_id != null
          ? {
              pageId: `${entry_id}/workflow-group-overview`,
              urlQuery: { workflow_id: wfDoc._id, group_id },
            }
          : null,
      action_group: group_id,
      workflow_type: wfDoc.workflow_type,
      workflow_id: wfDoc._id,
      status: deriveGroupStatus(
        rawActions.filter((act) => (act.action_group ?? null) === group_id),
      ),
      actions: cards,
    }));

    return {
      ...wfDoc,
      title: wfConfig?.title ?? null,
      entity_link: buildEntityLink({
        entityConfig: wfConfig?.entity,
        entityId: wfDoc.entity?.id ?? null,
      }),
      // Pruned to view-visible actions — denied slices never ship (same
      // policy as GetWorkflowOverview / GetWorkflowActionGroupOverview).
      form_data: pruneFormData({ formData: wfDoc.form_data, visibleActions }),
      groups,
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
