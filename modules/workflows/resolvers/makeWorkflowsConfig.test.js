import { test } from 'node:test';
import assert from 'node:assert/strict';
import makeWorkflowsConfig from './makeWorkflowsConfig.js';

const validWorkflow = {
  type: 'onboarding',
  entity_collection: 'leads-collection',
  display_order: 1,
  starting_actions: [{ type: 'do-it', status: 'action-required' }],
  actions: [{ type: 'do-it', kind: 'task' }],
};

test('makeWorkflowsConfig: entity_collection flows through and no entity_type appears on the normalized output', () => {
  const [out] = makeWorkflowsConfig(null, { workflows: [validWorkflow] });
  assert.equal(out.entity_collection, 'leads-collection');
  assert.equal('entity_type' in out, false);
});

test('makeWorkflowsConfig: rejects legacy entity_type with migration message', () => {
  const workflow = {
    ...validWorkflow,
    entity_collection: undefined,
    entity_type: 'lead',
  };
  delete workflow.entity_collection;

  assert.throws(
    () => makeWorkflowsConfig(null, { workflows: [workflow] }),
    (err) => {
      assert.ok(
        err.message.includes('legacy "entity_type" field is no longer supported'),
        `expected migration message, got: ${err.message}`
      );
      assert.ok(
        err.message.includes('onboarding'),
        `expected workflow type in message, got: ${err.message}`
      );
      return true;
    }
  );
});

test('makeWorkflowsConfig: rejects when both entity_type and entity_collection are declared (migration check fires first)', () => {
  const workflow = {
    ...validWorkflow,
    entity_type: 'lead',
  };

  assert.throws(
    () => makeWorkflowsConfig(null, { workflows: [workflow] }),
    (err) => {
      assert.ok(
        err.message.includes('legacy "entity_type" field is no longer supported'),
        `expected migration message, got: ${err.message}`
      );
      return true;
    }
  );
});
