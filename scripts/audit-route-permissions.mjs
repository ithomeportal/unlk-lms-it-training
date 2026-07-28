#!/usr/bin/env node
/**
 * Static authorization audit for API route handlers.
 *
 * Fails (exit 1) if a mutating handler (POST/PUT/PATCH/DELETE) is guarded by a
 * READ-only gate — the one mistake that would silently hand write access to the
 * read-only `auditor` role. Also lists every handler and its gate so the actual
 * policy surface is reviewable at a glance.
 *
 *   node scripts/audit-route-permissions.mjs
 */
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_ROOT = 'src/app/api';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Gates that must never appear in a mutating handler.
const READ_ONLY_GATES = ['canViewAdmin', 'canExportData', 'hasFullUserVisibility'];
const WRITE_GATES = ['canManage', 'isAdmin', 'isSuperAdmin'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const files = walk(API_ROOT).sort();
const rows = [];
const violations = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // Split the file into per-handler segments so a gate is attributed to the
  // handler it actually sits in, not merely to the file.
  const marker = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const hits = [...src.matchAll(marker)];

  for (let i = 0; i < hits.length; i++) {
    const method = hits[i][1];
    const body = src.slice(hits[i].index, i + 1 < hits.length ? hits[i + 1].index : src.length);

    const readGates = READ_ONLY_GATES.filter((g) => new RegExp(`\\b${g}\\s*\\(`).test(body));
    const writeGates = WRITE_GATES.filter((g) => new RegExp(`\\b${g}\\s*\\(`).test(body));
    const gates = [...writeGates, ...readGates];

    rows.push({
      route: relative(API_ROOT, file).replace(/\/route\.ts$/, '') || '/',
      method,
      gates: gates.length ? gates.join(', ') : '(none)',
    });

    if (WRITE_METHODS.has(method) && readGates.length && !writeGates.length) {
      violations.push(
        `${file}: ${method} is guarded only by read-only gate(s): ${readGates.join(', ')}`
      );
    }
  }
}

const width = Math.max(...rows.map((r) => r.route.length));
for (const r of rows) {
  console.log(`${r.route.padEnd(width)}  ${r.method.padEnd(6)}  ${r.gates}`);
}

console.log(`\n${rows.length} handlers across ${files.length} route files.`);

if (violations.length) {
  console.error('\nFAIL — write handler(s) using a read-only gate:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('PASS — no write handler is guarded by a read-only gate.');
