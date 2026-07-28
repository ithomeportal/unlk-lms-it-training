#!/usr/bin/env node
/**
 * Guard: browser-only packages must never be reachable from server-rendered code.
 *
 * Why this exists — 2026-07-28: `isomorphic-dompurify` pulls in jsdom, whose
 * dependency chain (html-encoding-sniffer -> @exodus/bytes) is ESM-only. Next
 * externalises jsdom on the server and require()s it at runtime, which throws
 * ERR_REQUIRE_ESM. That 500'd /courses/[slug] — the core page of the product —
 * for every user, for at least six days, with every other page healthy and no
 * code change to blame.
 *
 *   node scripts/check-server-bundle.mjs
 *
 * Runs as `postbuild`, so it also runs on Vercel (which invokes `npm run
 * build`); a failure here blocks the deployment.
 *
 * NOTE: this deliberately checks SOURCE, not the emitted bundle. A bundle scan
 * was tried first and was useless — with the bug deliberately reintroduced,
 * `isomorphic-dompurify` and `jsdom` appeared nowhere in `.next/server/**\/*.js`
 * (turbopack externalises them in a form grep cannot see) and nowhere in the
 * .nft.json traces either, so the scan reported PASS on known-broken code.
 * Verify any future change to this file the same way: reintroduce the import,
 * confirm this script FAILS, then remove it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = 'src';

// package -> the only modules allowed to import it. Those modules must
// themselves be loaded with next/dynamic { ssr: false }.
const BROWSER_ONLY = [
  {
    pkg: 'isomorphic-dompurify',
    allowedFrom: ['src/app/courses/[slug]/sanitized-html.tsx'],
    why: 'pulls jsdom (ESM-only chain) into the server bundle; load via next/dynamic { ssr: false }',
  },
  {
    pkg: 'jsdom',
    allowedFrom: [],
    why: 'ESM-only dependency chain breaks require() in the serverless runtime',
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative('.', file).split(sep).join('/');

  for (const { pkg, allowedFrom, why } of BROWSER_ONLY) {
    // static import, `import(...)`, or require()
    const imported = new RegExp(
      `(from\\s+['"]${pkg}['"])|(import\\s*\\(\\s*['"]${pkg}['"])|(require\\(\\s*['"]${pkg}['"])`
    ).test(src);
    if (imported && !allowedFrom.includes(rel)) {
      violations.push({ rel, pkg, why });
    }
  }
}

// The allowed module is only safe if it is actually loaded client-side.
for (const { pkg, allowedFrom } of BROWSER_ONLY) {
  for (const owner of allowedFrom) {
    const base = owner.split('/').pop().replace(/\.tsx?$/, '');
    const importers = files.filter((f) => {
      const rel = relative('.', f).split(sep).join('/');
      if (rel === owner) return false;
      return new RegExp(`['"]\\./${base}['"]`).test(readFileSync(f, 'utf8'));
    });
    for (const f of importers) {
      const src = readFileSync(f, 'utf8');
      const rel = relative('.', f).split(sep).join('/');
      const dynamicSsrFalse = new RegExp(
        `dynamic\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]\\./${base}['"]\\s*\\)\\s*,\\s*\\{[^}]*ssr\\s*:\\s*false`
      ).test(src);
      if (!dynamicSsrFalse) {
        violations.push({
          rel,
          pkg,
          why: `imports ./${base} (which uses ${pkg}) without next/dynamic { ssr: false } — it would be server-rendered`,
        });
      }
    }
  }
}

console.log(`check-server-bundle: scanned ${files.length} source files.`);

if (violations.length) {
  console.error('\nFAIL — browser-only package reachable from server-rendered code:\n');
  for (const v of violations) {
    console.error(`  ${v.rel}`);
    console.error(`    ${v.pkg}: ${v.why}\n`);
  }
  console.error('This would 500 the affected route in production. See docs/SPEC-COURSES.md.');
  process.exit(1);
}

console.log('PASS — no browser-only packages reachable from the server.');
