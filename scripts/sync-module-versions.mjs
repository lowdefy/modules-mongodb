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
 * Sync Module Versions
 *
 * Copies each module's package.json version to its module.lowdefy.yaml so the
 * manifest exposes the same version that Changesets just wrote. Runs after
 * `changeset version` as part of `release:version`, so the version bumps land
 * in the "Publish new release" PR and ship with the rest of the release.
 *
 * Zero external dependencies.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const MODULES_DIR = join(ROOT, 'modules');

function syncOne(moduleDir) {
  const pkgPath = join(moduleDir, 'package.json');
  const manifestPath = join(moduleDir, 'module.lowdefy.yaml');
  if (!existsSync(pkgPath) || !existsSync(manifestPath)) return null;

  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const version = pkgJson.version;
  const manifest = readFileSync(manifestPath, 'utf-8');

  if (/^version:\s*.+$/m.test(manifest)) {
    const updated = manifest.replace(/^version:\s*.+$/m, `version: ${version}`);
    if (updated === manifest) return { name: pkgJson.name, version, changed: false };
    writeFileSync(manifestPath, updated, 'utf-8');
    return { name: pkgJson.name, version, changed: true };
  }

  const updated = manifest.replace(
    /^(name:\s*.+)$/m,
    (match) => `${match}\nversion: ${version}`
  );
  if (updated === manifest) {
    console.warn(`  ${pkgJson.name}: no "name:" line found, leaving manifest untouched`);
    return { name: pkgJson.name, version, changed: false };
  }
  writeFileSync(manifestPath, updated, 'utf-8');
  return { name: pkgJson.name, version, changed: true, inserted: true };
}

function main() {
  if (!existsSync(MODULES_DIR) || !statSync(MODULES_DIR).isDirectory()) {
    console.error(`modules/ directory not found at ${MODULES_DIR}`);
    process.exit(1);
  }

  console.log('Syncing module.lowdefy.yaml versions from package.json...');
  let updatedCount = 0;

  for (const entry of readdirSync(MODULES_DIR)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'shared') continue;
    const moduleDir = join(MODULES_DIR, entry);
    if (!statSync(moduleDir).isDirectory()) continue;

    const result = syncOne(moduleDir);
    if (!result) continue;

    const tag = result.changed ? (result.inserted ? 'inserted' : 'updated') : 'unchanged';
    console.log(`  ${entry}: ${result.version} (${tag})`);
    if (result.changed) updatedCount += 1;
  }

  console.log(`\nDone. ${updatedCount} manifest(s) updated.`);
}

main();
