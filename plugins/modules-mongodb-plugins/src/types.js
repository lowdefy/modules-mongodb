import { extractBlockTypes } from '@lowdefy/block-utils';
import * as actions from './actions.js';
import * as metas from './metas.js';

const blockTypes = extractBlockTypes(metas);
export default {
  ...blockTypes,
  actions: Object.keys(actions),
  operators: {},
  connections: [],
  requests: [],
};
