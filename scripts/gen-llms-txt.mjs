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
 * llms.txt Generator for @lowdefy/modules-mongodb
 *
 * Walks `docs/**\/\*.md`, reads each file's front-matter and first prose
 * paragraph, and writes `docs/llms.txt` — a flat, grouped index of the
 * entire doc set. Follows the emerging llms.txt convention (markdown list
 * of links with descriptions), grouped by module, path-sorted within each
 * group.
 *
 * ALSO acts as a front-matter linter: validates that every doc has the
 * required fields (`title`, `module`, `type`) and an allowed `type` value
 * (`index | concept | how-to | reference | shared`). Front-matter violations
 * are hard errors.
 *
 * Usage:
 *   node scripts/gen-llms-txt.mjs              # write docs/llms.txt
 *   node scripts/gen-llms-txt.mjs --check      # diff + lint; exit 1 if stale/invalid
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
} from "fs";
import { join, dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const DOCS_DIR = join(ROOT, "docs");
const LLMS_TXT_PATH = join(DOCS_DIR, "llms.txt");

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const FLAG_CHECK = args.includes("--check");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = new Set([
  "index",
  "concept",
  "how-to",
  "reference",
  "shared",
]);
const REQUIRED_FIELDS = ["title", "module", "type"];

// Group ordering: root/shared/plugins first, then module names alpha
const FIXED_GROUP_ORDER = ["root", "shared", "plugins"];

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .md files under a directory.
 * Returns absolute paths, path-sorted.
 */
function collectMarkdownFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Front-matter parser
// ---------------------------------------------------------------------------

/**
 * Parse YAML front-matter from a markdown file.
 * Returns { frontMatter, body } where frontMatter is the parsed object
 * (or null if no front-matter block is present) and body is the rest of
 * the file after the closing '---'.
 */
function parseFrontMatter(content) {
  if (!content.startsWith("---")) {
    return { frontMatter: null, body: content };
  }
  const match = content.match(/\n---[ \t]*(\n|$)/);
  const end = match ? match.index : -1;
  if (end === -1) {
    return { frontMatter: null, body: content };
  }
  const raw = content.slice(4, end); // skip opening '---\n'
  const body = content.slice(end + match[0].length); // skip closing '\n---' line
  try {
    const frontMatter = yaml.load(raw) ?? {};
    return { frontMatter, body };
  } catch {
    return { frontMatter: null, body: content };
  }
}

// ---------------------------------------------------------------------------
// Summary extractor
// ---------------------------------------------------------------------------

/**
 * Extract the first prose paragraph from the body of a markdown file.
 *
 * Skips:
 *   - HTML comments (<!-- ... -->), including multi-line ones
 *   - Leading blank lines
 *   - Lines that are headings (start with #)
 *
 * Returns the first non-empty, non-comment, non-heading paragraph as a
 * single line (newlines within the paragraph collapsed to spaces).
 * Falls back to an empty string if no prose paragraph is found.
 */
function extractSummary(body) {
  // Strip all HTML comments (including multi-line)
  let text = body.replace(/<!--[\s\S]*?-->/g, "");

  // Split into lines and walk to find the first prose paragraph
  const lines = text.split("\n");
  let i = 0;
  const paraLines = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines when we haven't started a paragraph yet
    if (trimmed === "") {
      if (paraLines.length > 0) break; // blank line ends the paragraph
      i++;
      continue;
    }

    // Skip headings
    if (trimmed.startsWith("#")) {
      i++;
      continue;
    }

    // Skip lines that look like YAML front-matter remnants (shouldn't happen
    // after parseFrontMatter, but be defensive)
    if (trimmed === "---") {
      i++;
      continue;
    }

    paraLines.push(trimmed);
    i++;
  }

  return paraLines.join(" ");
}

// ---------------------------------------------------------------------------
// Front-matter linter
// ---------------------------------------------------------------------------

/**
 * Validate a single doc's front-matter.
 * Returns an array of violation messages (empty if valid).
 */
function lintFrontMatter(frontMatter, filePath) {
  const relPath = relative(ROOT, filePath);
  const violations = [];

  if (!frontMatter) {
    violations.push(`${relPath}: missing front-matter block`);
    return violations;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!frontMatter[field]) {
      violations.push(
        `${relPath}: missing required front-matter field '${field}'`,
      );
    }
  }

  if (frontMatter.type && !ALLOWED_TYPES.has(frontMatter.type)) {
    violations.push(
      `${relPath}: invalid type '${frontMatter.type}' (allowed: ${[...ALLOWED_TYPES].join(", ")})`,
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Entry builder
// ---------------------------------------------------------------------------

/**
 * Process a single markdown file and return its index entry.
 * Returns { relPath, module, title, summary, lintErrors }.
 */
function processDoc(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const { frontMatter, body } = parseFrontMatter(content);
  const lintErrors = lintFrontMatter(frontMatter, filePath);
  const relPath = relative(ROOT, filePath);

  const title = frontMatter?.title ?? "";
  const module = frontMatter?.module ?? "";

  let summary = extractSummary(body);
  // Truncate very long summaries (first paragraph can be very long in reference docs)
  if (summary.length > 300) {
    summary = summary.slice(0, 297) + "...";
  }

  return { relPath, module, title, summary, lintErrors };
}

// ---------------------------------------------------------------------------
// llms.txt builder
// ---------------------------------------------------------------------------

/**
 * Determine the stable sort key for a group name.
 * Fixed group order: root, shared, plugins, then alphabetical by module name.
 */
function groupSortKey(groupName) {
  const idx = FIXED_GROUP_ORDER.indexOf(groupName);
  if (idx !== -1) return `0_${idx}_${groupName}`;
  return `1_${groupName}`;
}

/**
 * Build the full content of docs/llms.txt from a list of processed entries.
 */
function buildLlmsTxt(entries) {
  const lines = [];

  lines.push("# llms.txt — @lowdefy/modules-mongodb doc index");
  lines.push("#");
  lines.push(
    "# Machine-readable index of the docs/ tree. One line per doc, grouped by",
  );
  lines.push(
    "# module. Generated by scripts/gen-llms-txt.mjs — do not edit by hand.",
  );
  lines.push(
    "# Re-run the script whenever docs are added, removed, or renamed.",
  );
  lines.push("");

  // Group entries by module
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.module || "root";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  // Sort groups: fixed order first, then alpha
  const sortedGroupNames = [...groups.keys()].sort((a, b) =>
    groupSortKey(a).localeCompare(groupSortKey(b)),
  );

  for (const groupName of sortedGroupNames) {
    const groupEntries = groups.get(groupName);

    // Section header
    lines.push(`## ${groupName}`);
    lines.push("");

    // Entries are already path-sorted because collectMarkdownFiles sorts them
    for (const entry of groupEntries) {
      const description = entry.summary
        ? `${entry.title} — ${entry.summary}`
        : entry.title;
      lines.push(`- ${entry.relPath}: ${description}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Write mode
// ---------------------------------------------------------------------------

function writeMode(files) {
  const allViolations = [];
  const entries = [];

  for (const filePath of files) {
    const doc = processDoc(filePath);
    allViolations.push(...doc.lintErrors);
    entries.push(doc);
  }

  if (allViolations.length > 0) {
    console.error("\nFront-matter lint violations:\n");
    for (const v of allViolations) {
      console.error(`  ERROR: ${v}`);
    }
    console.error(
      `\n${allViolations.length} front-matter violation(s) found. Fix them and re-run.`,
    );
    process.exit(1);
  }

  const content = buildLlmsTxt(entries);
  mkdirSync(dirname(LLMS_TXT_PATH), { recursive: true });
  writeFileSync(LLMS_TXT_PATH, content, "utf-8");
  console.log(`  Wrote ${LLMS_TXT_PATH} (${entries.length} docs indexed)`);
  return entries.length;
}

// ---------------------------------------------------------------------------
// Check mode
// ---------------------------------------------------------------------------

function checkMode(files) {
  const allViolations = [];
  const entries = [];

  for (const filePath of files) {
    const doc = processDoc(filePath);
    allViolations.push(...doc.lintErrors);
    entries.push(doc);
  }

  let failed = false;

  // --- Front-matter lint ---
  if (allViolations.length > 0) {
    console.error("\nFront-matter lint violations:\n");
    for (const v of allViolations) {
      console.error(`  ERROR: ${v}`);
    }
    failed = true;
  }

  // --- Diff check (in-memory compare against committed) ---
  const generated = buildLlmsTxt(entries);

  if (!existsSync(LLMS_TXT_PATH)) {
    console.error(
      `  DRIFT: docs/llms.txt does not exist (run node scripts/gen-llms-txt.mjs to create it)`,
    );
    failed = true;
  } else {
    const committed = readFileSync(LLMS_TXT_PATH, "utf-8");
    if (committed !== generated) {
      console.error(
        `  DRIFT: docs/llms.txt is out of date (run node scripts/gen-llms-txt.mjs to regenerate it)`,
      );
      failed = true;
    }
  }

  return { failed, count: entries.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const files = collectMarkdownFiles(DOCS_DIR);

  if (FLAG_CHECK) {
    console.log("llms.txt Generator — check mode\n");
    const { failed, count } = checkMode(files);
    if (!failed) {
      console.log(
        `docs/llms.txt is up to date (${count} docs indexed). Front-matter valid.`,
      );
      process.exit(0);
    } else {
      console.error("\nRun `node scripts/gen-llms-txt.mjs` to fix.");
      process.exit(1);
    }
  } else {
    console.log("llms.txt Generator\n");
    const count = writeMode(files);
    console.log(`\nDone: ${count} docs indexed.`);
  }
}

main();
