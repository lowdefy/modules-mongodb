#!/usr/bin/env node

/*
  Copyright 2020-2026 Lowdefy, Inc

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

/**
 * Patch Guard for @lowdefy/modules-mongodb
 *
 * Every @lowdefy/* package we patch ships from one Lowdefy release, at the same
 * version string the demo pins as `lowdefy`. A patch keyed to an older version
 * therefore no longer applies to anything — and pnpm will not say so, because
 * `allowUnusedPatches` is on (it has to be: the patched packages arrive through
 * the build-generated .lowdefy/server manifest, not through any tracked
 * package.json, so on a clean checkout pnpm sees the patch match nothing and
 * would fail the install outright).
 *
 * That leaves one way for a patch to die quietly: bump Lowdefy, forget to re-cut
 * the patch, and the fix silently reverts with only a warning buried in install
 * output. This asserts the version keys still line up, so that bump fails loudly
 * in CI instead.
 *
 * Usage:
 *   node scripts/check-patches.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The demo is the app whose Lowdefy version the patches target; workflows-test
// deliberately runs a different (released) line and is not patched.
const REFERENCE_APP = "apps/demo";

function fail(lines) {
  console.error(`\n✖ Patch guard failed\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

const workspace = yaml.load(
  readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
);
const patched = workspace?.patchedDependencies ?? {};
const entries = Object.entries(patched);

if (entries.length === 0) {
  console.log("✔ Patch guard: no patched dependencies declared.");
  process.exit(0);
}

const { dependencies = {} } = JSON.parse(
  readFileSync(join(root, REFERENCE_APP, "package.json"), "utf8"),
);
const lowdefyVersion = dependencies.lowdefy;

if (!lowdefyVersion) {
  fail([`${REFERENCE_APP}/package.json declares no "lowdefy" dependency.`]);
}

const problems = [];

for (const [key, patchFile] of entries) {
  // Keys are "<name>@<version>"; scoped names carry their own leading @.
  const at = key.lastIndexOf("@");
  const name = key.slice(0, at);
  const version = key.slice(at + 1);

  if (!existsSync(join(root, patchFile))) {
    problems.push(`${key}\n    patch file missing: ${patchFile}`);
    continue;
  }

  if (name.startsWith("@lowdefy/") && version !== lowdefyVersion) {
    problems.push(
      `${key}\n    patched at ${version}, but ${REFERENCE_APP} runs lowdefy ${lowdefyVersion}.\n` +
        `    The patch no longer applies. Re-cut it against the new version:\n` +
        `      pnpm patch ${name}@${lowdefyVersion}\n` +
        `    or drop it if the fix has landed upstream.`,
    );
  }
}

if (problems.length > 0) fail(problems);

console.log(
  `✔ Patch guard: ${entries.length} patch(es) match lowdefy ${lowdefyVersion}.`,
);
