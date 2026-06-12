import { test as ldfTest, expect } from '@lowdefy/e2e-utils/fixtures';
import { mdbFixtures } from '@lowdefy/community-plugin-e2e-mdb/fixtures';
import { mergeTests } from '@playwright/test';
import { workflowTest } from './workflowFixture.js';

// ldf (navigation, block interaction, user sessions, request/api tracking)
// + mdb (Mongo seed/snap/read) + the workflows-test-only `workflow` fixture
// (thin wire drivers over the real emitted Lowdefy endpoints + DB readers).
export const test = mergeTests(ldfTest, mdbFixtures, workflowTest);
export { expect };
