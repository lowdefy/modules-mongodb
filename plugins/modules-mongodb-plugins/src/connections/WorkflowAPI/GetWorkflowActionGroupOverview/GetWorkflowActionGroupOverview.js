import createEngineContext from "../../shared/phases/createEngineContext.js";
import findDocs from "../../mongo/findDocs.js";
import resolveEntityData from "../../shared/render/resolveEntityData.js";
import {
  computeAllowed,
  collapseLink,
} from "../../shared/render/resolveActionAccess.js";
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
  const { params, mongoDb, connection, workflowsConfig, tenant } = context;
  const { workflow_id, group_id } = params;
  const app_name = connection.app_name;
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
      visibleKeysByType.set(type, "unkeyed");
    } else {
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
      prunedFormData[type] = rawFormData[type];
    } else {
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
        pageId: entityConfig.page_id,
        urlQuery: { [entityConfig.id_query_key]: wfDoc.entity.id },
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
