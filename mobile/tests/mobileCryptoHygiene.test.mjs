/**
 * @fileoverview Static hygiene tests for Sonaraim Mobile (`mobile/src/`).
 * Ensures Metro/Hermes compatibility: zero `node:*` imports and zero bare `Buffer` globals.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_SRC_DIR = path.resolve(__dirname, '../src');

/**
 * Recursively collects all `.js` and `.mjs` files under a directory.
 *
 * @param {string} dir - Directory path to scan.
 * @returns {Array<string>} Absolute file paths.
 */
function collectSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Issue #19: Mobile Runtime Compatibility (Zero node:* & Zero Buffer)', () => {
  it('contains zero node:* built-in imports under mobile/src/', () => {
    const files = collectSourceFiles(MOBILE_SRC_DIR);
    assert.ok(files.length > 0, 'Expected mobile/src/ to contain source files');

    const violations = [];
    const nodeImportPattern = /(['"`])node:[a-zA-Z0-9_-]+\1/;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (nodeImportPattern.test(line)) {
          violations.push(`${path.relative(MOBILE_SRC_DIR, file)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    assert.deepEqual(violations, [], `Found forbidden node:* imports:\n${violations.join('\n')}`);
  });

  it('contains zero bare Buffer references under mobile/src/', () => {
    const files = collectSourceFiles(MOBILE_SRC_DIR);
    const violations = [];
    const bufferPattern = /\bBuffer\b/;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (bufferPattern.test(line)) {
          violations.push(`${path.relative(MOBILE_SRC_DIR, file)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    assert.deepEqual(violations, [], `Found forbidden Buffer references:\n${violations.join('\n')}`);
  });
});
