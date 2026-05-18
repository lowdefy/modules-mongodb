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
 * @property {string} [reason]
 * @property {string} [error_message]
 * @property {Object} [error_metadata]
 */

/**
 * @typedef {Object} WorkflowGroupEntry
 * @property {string} id
 * @property {'blocked' | 'in-progress' | 'done'} status
 * @property {{ done: number, not_required: number, total: number }} summary
 */

/**
 * @typedef {Object} WorkflowDoc
 * @property {string} _id
 * @property {string} workflow_type
 * @property {string | null} key
 * @property {number} display_order
 * @property {string} entity_type
 * @property {string} entity_id
 * @property {string} entity_collection
 * @property {string | null} parent_action_id
 * @property {string | null} parent_entity_id
 * @property {string | null} parent_entity_collection
 * @property {StatusEntry[]} status
 * @property {{ done: number, not_required: number, total: number }} summary
 * @property {WorkflowGroupEntry[]} groups
 * @property {Object} form_data
 * @property {ChangeStamp} created
 * @property {ChangeStamp} updated
 */

/**
 * @typedef {'form' | 'task' | 'tracker'} ActionKind
 */

/**
 * @typedef {Object} ActionDoc
 * @property {string} _id
 * @property {string} workflow_id
 * @property {string} type
 * @property {ActionKind} kind
 * @property {string | null} key
 * @property {StatusEntry[]} status
 * @property {string} entity_type
 * @property {string} entity_id
 * @property {string} entity_collection
 * @property {string[]} assignees
 * @property {Date | null} due_date
 * @property {string | null} description
 * @property {{ workflow_type: string } | null} tracker
 * @property {string | null} child_workflow_id
 * @property {string | null} child_entity_id
 * @property {string | null} child_entity_collection
 */

export {};
