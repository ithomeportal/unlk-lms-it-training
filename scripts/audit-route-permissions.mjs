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
const WRITE_GATES = ['canManage', 'isAdmin', 'isSuperAdmin', 'canManageRoles'];

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

const ungated = [];
const opaque = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // Split the file into per-handler segments so a gate is attributed to the
  // handler it actually sits in, not merely to the file.
  const marker = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const hits = [...src.matchAll(marker)];

  if (!hits.length) {
    // e.g. `export const { GET, POST } = createRouteHandler(...)` (uploadthing).
    // This script cannot see where such handlers are gated, so it must SAY SO
    // rather than silently contribute zero rows and inflate the "PASS".
    const destructured = src.match(/export\s+const\s*\{([^}]*)\}/);
    const methods = destructured
      ? destructured[1].split(',').map((s) => s.trim()).filter((m) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(m))
      : [];
    opaque.push(
      `${file}: handlers not declared as \`export function\`` +
        (methods.length ? ` (exports ${methods.join('/')} indirectly)` : '') +
        ' — gate must be verified by hand'
    );
    continue;
  }

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

    // A handler with NO gate at all is not automatically wrong — several
    // writes are legitimately available to any signed-in user — but it must
    // be surfaced, not silently counted as passing.
    if (WRITE_METHODS.has(method) && !gates.length) {
      ungated.push(`${file}: ${method} has no role gate (session-only or unauthenticated?)`);
    }
  }
}

const width = Math.max(...rows.map((r) => r.route.length));
for (const r of rows) {
  console.log(`${r.route.padEnd(width)}  ${r.method.padEnd(6)}  ${r.gates}`);
}

console.log(`\n${rows.length} handlers parsed across ${files.length} route files.`);

if (opaque.length) {
  console.log('\nNOT INSPECTED — verify these by hand:');
  for (const o of opaque) console.log('  ' + o);
}

if (ungated.length) {
  console.log(`\nWRITE handlers with no role gate (${ungated.length}) — review, not necessarily wrong:`);
  for (const u of ungated) console.log('  ' + u);
}

if (violations.length) {
  console.error('\nFAIL — write handler(s) using a read-only gate:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log("PASS — no write handler is guarded by a read-only gate (see caveats above).");
