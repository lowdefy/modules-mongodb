/**
 * Group annotated visible actions by `action_group` and assign each group its
 * declaration-order index. Shared by GetEntityWorkflows and
 * GetWorkflowOverview, which render the same grouping with different final
 * entry shapes (the caller maps each collected group to its response shape).
 *
 * Ordering: groups declared in the config's `action_groups[]` keep their
 * declaration index; unseen groups (including the `null` group) get insertion
 * indices after all declared groups, so they sort last, stably. Cards keep the
 * input order of `visibleActions` — sort it (declaration order) before calling.
 *
 * @param {{
 *   visibleActions: Array<{ action: object }>,  // output of selectVisibleActions
 *   configGroups?: object[],                     // wfConfig.action_groups
 *   makeCard: (entry: object) => object,         // annotated entry → card
 * }}
 * @returns {Array<{ group_id: any, order: number, configGroup: object | null, cards: object[] }>}
 *   sorted by `order`.
 */
export default function collectActionGroups({
  visibleActions,
  configGroups = [],
  makeCard,
}) {
  const orderByGroupId = new Map(configGroups.map((g, i) => [String(g.id), i]));

  // Collect cards per group_id (first-seen insertion order).
  const groupMap = new Map(); // String(group_id) → { group_id, cards }
  for (const entry of visibleActions) {
    const group_id = entry.action.action_group ?? null;
    const key = String(group_id);
    if (!groupMap.has(key)) {
      groupMap.set(key, { group_id, cards: [] });
    }
    groupMap.get(key).cards.push(makeCard(entry));
  }

  // Assign declaration-order indices; unseen groups slot after declared ones.
  let unseenInsertionIndex = 0;
  const groups = [];
  for (const [key, { group_id, cards }] of groupMap) {
    let order;
    if (orderByGroupId.has(key)) {
      order = orderByGroupId.get(key);
    } else {
      order = configGroups.length + unseenInsertionIndex;
      unseenInsertionIndex += 1;
    }
    groups.push({
      group_id,
      order,
      configGroup: configGroups.find((g) => g.id === group_id) ?? null,
      cards,
    });
  }

  groups.sort((a, b) => a.order - b.order);
  return groups;
}
