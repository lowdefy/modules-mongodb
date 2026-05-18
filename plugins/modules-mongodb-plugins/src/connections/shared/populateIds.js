import { randomUUID } from 'node:crypto';

/**
 * Assign server-generated `_id`s to new action draft objects.
 * Mutates each input in place and returns the same array for chaining.
 *
 * @template {object} T
 * @param {T[]} actions
 * @returns {(T & { _id: string })[]}
 */
function populateIds(actions) {
  for (const action of actions) {
    if (!action._id) action._id = randomUUID();
  }
  return /** @type {(T & { _id: string })[]} */ (actions);
}

export default populateIds;
