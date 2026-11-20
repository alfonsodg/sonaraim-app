/**
 * @fileoverview Issue #28 follow-up TDD: the Docker runtime stage must ship
 * `public/` (icons + service worker), otherwise #28 passes locally but 404s
 * in the production image.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCKERFILE = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile'), 'utf8');

function runtimeStage() {
  const marker = 'FROM node:22-alpine AS runtime';
  const idx = DOCKERFILE.indexOf(marker);
  assert.ok(idx >= 0, 'Dockerfile must declare a runtime stage');
  return DOCKERFILE.slice(idx);
}

test('#28 follow-up: builder stage copies public/ for in-image tests', () => {
  const builder = DOCKERFILE.slice(0, DOCKERFILE.indexOf('AS runtime'));
  assert.match(builder, /COPY public\/ \.\/public\//);
});

test('#28 follow-up: runtime stage ships public/ so icons + SW resolve in production', () => {
  const runtime = runtimeStage();
  assert.match(
    runtime,
    /COPY --from=builder .*public .*public/,
    'runtime stage must COPY public/ from builder (icons + sw.js 404 otherwise)'
  );
});
