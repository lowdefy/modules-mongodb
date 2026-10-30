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
 * GetWorkflowActionGroupOverview — server-side replacement for the
 * get-action-group-overview.yaml aggregation (Part 46 task 4).
 *
 * Reads a single workflow by _id, joins actions for a specific action_group,
 * applies per-user access filtering, sorts with not-required-sinks-last,
 * and enriches with display config. Collapses group to null when the workflow
 * doesn't exist, has no visible actions, or the group is unknown.
 *
 * The group's `status`/`summary` are derived on read from the group's action
 * docs (`deriveGroupStatus` / `summarizeStatuses`, over ALL of the group's
 * actions — an objective property), and the existence guard keys off the
 * declared config group.
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
  const { params, mongoDb, connection, workflowsConfig, tenant } = context;
  const { workflow_id, group_id } = params;
  const slug = connection.slug;
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
    return { workflow: null, group: null, actions: [] };
  }

  const wfConfig = (workflowsConfig ?? []).find(
    (wc) => wc.type === wfDoc.workflow_type,
  );
  const wfActionsConfig = wfConfig?.actions ?? [];

  // ── Load: actions for this workflow in this group only ──
  const rawActions = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { workflow_id, action_group: group_id },
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

  // ── Build action cards ──
  // form_meta comes from the validated action config (form-kind actions only).
  function findActionConfig(type) {
    return wfActionsConfig.find((c) => c.type === type);
  }

  const actionCards = visibleActions.map(
    ({ action, allowed, link, message, status }) => {
      const actionConfig = findActionConfig(action.type);
      const form_meta = actionConfig?.form_meta ?? null;
      return {
        type: action.type,
        key: action.key ?? null,
        status,
        message,
        link,
        allowed,
        form_meta,
      };
    },
  );

  // ── Prune form_data to view-visible actions ──
  const prunedFormData = pruneFormData({
    formData: wfDoc.form_data,
    actions: visibleActions.map(({ action }) => action),
  });

  // ── Workflow title + entity_link ──
  // Part 26: lift the instance `name` onto entity_link from the host's
  // entity.data routine (server-side; null when no routine / it throws), uniform
  // with the action and overview pages. No `entity` object — chrome only.
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
  };

  // ── Group collapse logic (mirrors the original aggregation's :return) ──
  // group is null when: no visible actions, OR the group_id is not a declared
  // config group. Part 66: the existence guard keys off the declared config
  // group (the doc no longer carries a runtime groups[] cache) — behaviour-
  // equivalent, since groups[] was only ever populated for declared groups.
  if (visibleActions.length === 0) {
    return { workflow, group: null, actions: [] };
  }

  const configGroups = wfConfig?.action_groups ?? [];
  const configGroup = configGroups.find((g) => g.id === group_id);
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
