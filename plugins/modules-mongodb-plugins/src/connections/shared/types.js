// Document shapes per designs/workflows-module-concept/engine/spec.md § Schema.

/**
 * @typedef {Object} ChangeStamp
 * @property {Date} timestamp
 * @property {{ id: string, name: string }} user
 */

/**
 * @typedef {Object} StatusEntry
 * @property {string} stage
 * @property {ChangeStamp} created
 * @property {string} [event_id]
 */

/**
 * @typedef {Object} WorkflowDoc
 * @property {string} _id
 * @property {string} workflow_type
 * @property {string | null} key
 * @property {number} display_order
 * @property {{ connection_id: string, id: string, ref_key: string }} entity
 * @property {string | null} parent_action_id
 * @property {{ connection_id: string, id: string } | null} parent_entity
 * @property {StatusEntry[]} status
 * @property {Object} form_data
 * @property {ChangeStamp} created
 * @property {ChangeStamp} updated
 *
 * The doc has no denormalised `summary`/`groups[]` fields — overview progress
 * counts derive on read from the action docs.
 */

/**
 * @typedef {'form' | 'check' | 'tracker'} ActionKind
 */

/**
 * @typedef {Object} ActionDoc
 * @property {string} _id
 * @property {string} workflow_id
 * @property {string} type
 * @property {ActionKind} kind
 * @property {string | null} key
 * @property {StatusEntry[]} status
 * @property {{ connection_id: string, id: string }} entity
 * @property {string[]} assignees
 * @property {Date | null} due_date
 * @property {{ child_workflow_type: string, start_link?: { pageId: string, urlQuery?: Object } } | null} tracker
 * @property {string | null} child_workflow_id
 * @property {{ connection_id: string, id: string } | null} child_entity
 */

export {};
