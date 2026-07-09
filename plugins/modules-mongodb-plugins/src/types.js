import { extractBlockTypes } from "@lowdefy/block-utils";
import * as actions from "./actions.js";
import * as connections from "./connections.js";
import * as metas from "./metas.js";

const blockTypes = extractBlockTypes(metas);
export default {
  ...blockTypes,
  actions: Object.keys(actions),
  operators: { client: [], server: ["_analytics"] },
  connections: Object.keys(connections),
  requests: Object.keys(connections).flatMap((c) =>
    Object.keys(connections[c].requests),
  ),
};
