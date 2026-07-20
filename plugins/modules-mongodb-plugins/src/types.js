import { extractBlockTypes } from "@lowdefy/block-utils";
import * as actions from "./actions.js";
import * as connections from "./connections.js";
import * as metas from "./metas.js";

const blockTypes = extractBlockTypes(metas);
export default {
  ...blockTypes,
  actions: Object.keys(actions),
  operators: {},
  connections: Object.keys(connections),
  // Build-side tenant contract declaration: the build only allows `tenant:` on
  // a connection whose type declares support here (the runtime half is the
  // `meta: { tenant: true }` on each connection's export).
  connectionMetas: {
    EventsTimeline: { tenant: true },
    WorkflowAPI: { tenant: true },
  },
  requests: Object.keys(connections).flatMap((c) =>
    Object.keys(connections[c].requests),
  ),
};
