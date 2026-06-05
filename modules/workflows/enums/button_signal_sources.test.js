import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { FSM_TABLES } from '@lowdefy/modules-mongodb-plugins/fsm';

// The six signals surfaced by form-action submit buttons (design 39). `error`
// is pre-hook-only and intentionally absent.
const BUTTON_SIGNALS = [
  'submit',
  'progress',
  'not_required',
  'approve',
  'request_changes',
  'resolve_error',
];

// Derive source-stages from the FSM table programmatically. The `none` row is
// excluded because `none` is a transient resolution-time sentinel — never a
// stored status (tables.js header: "never a stored status"). Without this
// exclusion the `request_changes` signal would incorrectly include `none` (its
// upsert-spawn entry) and the set comparison would fail.
function deriveSourceStages(signal) {
  return Object.keys(FSM_TABLES.form).filter(
    (stage) => stage !== 'none' && signal in FSM_TABLES.form[stage],
  );
}

const enumPath = join(__dirname, 'button_signal_sources.yaml');
const enumData = loadYaml(readFileSync(enumPath, 'utf8'));

test('button_signal_sources enum contains exactly the six button-surfaced signals', () => {
  expect(Object.keys(enumData).sort()).toEqual([...BUTTON_SIGNALS].sort());
});

test.each(BUTTON_SIGNALS)(
  'button_signal_sources: %s source-stages match FSM table (set equality, none excluded)',
  (signal) => {
    const enumStages = new Set(enumData[signal]);
    const derivedStages = new Set(deriveSourceStages(signal));
    expect(enumStages).toEqual(derivedStages);
  },
);
