#!/usr/bin/env node
// Static validator for a patched dsh-bots copy.
// Checks the zen-remote bridge declaration in index.js against the
// Plugin Bridge spec (dsh-zen-remote docs/plugin-bridge.md) and against
// the copy's own package.json. No DSH, no network, no dependencies.
// Usage: node scripts/verify-bridge.mjs [path-to-patched-dsh-bots]
// Exit 0 = all checks pass, 1 = any check fails.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? '.';
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const pkgPath = join(dir, 'package.json');
const indexPath = join(dir, 'index.js');
if (!existsSync(pkgPath) || !existsSync(indexPath)) {
  console.error(`Expected ${pkgPath} and ${indexPath} to exist.`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const src = readFileSync(indexPath, 'utf8');

check(pkg.name === '@kadaliao/dsh-bots', 'package name', pkg.name);
const declMatch = src.match(/const declaration = \{([\s\S]*?)\n    \};/);
check(Boolean(declMatch), 'bridge declaration literal present in index.js');
if (!declMatch) process.exit(1);

// Evaluate only the declaration object literal (no other code runs).
const declaration = new Function(`return {${declMatch[1]}};`)();
check(declaration.plugin === pkg.name, 'declaration.plugin matches package.json name', declaration.plugin);
check(declaration.version === pkg.version, 'declaration.version matches package.json version', declaration.version);
check(typeof declaration.version === 'string' && declaration.version.length > 0, 'declaration.version non-empty');
check(Array.isArray(declaration.routes) && declaration.routes.length >= 1 && declaration.routes.length <= 64, 'routes: 1..64 entries', String(declaration.routes?.length));
const route = declaration.routes[0];
check(route.path === '/__dsh_bots', 'route.path is /__dsh_bots', route.path);
check(route.path.startsWith('/') && !route.path.includes('?') && !route.path.includes('#') && !route.path.includes('..') && !route.path.startsWith('/_dsh/') && !route.path.startsWith('/api'), 'route.path shape valid');
check(route.prefix === true, 'route.prefix is true');
check(route.scope === 'server', "route.scope is 'server' (panel is whole-machine data)", route.scope);
check(JSON.stringify([...route.methods].sort()) === JSON.stringify(['GET', 'POST']), 'route.methods are GET+POST', JSON.stringify(route.methods));
check(Number.isInteger(route.maxBody) && route.maxBody > 0 && route.maxBody <= 500 * 1024 * 1024, 'route.maxBody within 1..500 MiB', String(route.maxBody));
check(route.maxBody >= 40 * 1024 * 1024, 'route.maxBody covers bots image-upload limit (40 MiB)', String(route.maxBody));
// rewriteIds (zen-remote 2.4+, PB-25a): the { fields } form is the value
// deep-scan PLUS a position rewrite for newly-created ids at the declared
// paths. POST send/open and the ticket routes answer a top-level
// `sessionId` the panel feeds to env.openSession(); without this the host's
// real id reaches the remote browser and "open conversation" fails.
check(route.rewriteIds !== undefined && typeof route.rewriteIds === 'object' && !Array.isArray(route.rewriteIds), 'route.rewriteIds is the { fields } form (not true, not absent)', JSON.stringify(route.rewriteIds));
check(Array.isArray(route.rewriteIds?.fields) && JSON.stringify(route.rewriteIds.fields) === JSON.stringify(['sessionId']), "route.rewriteIds.fields is exactly ['sessionId']", JSON.stringify(route.rewriteIds?.fields));
check(Array.isArray(route.rewriteIds?.fields) && route.rewriteIds.fields.every((f) => typeof f === 'string' && f.length > 0 && f.split('.').every((s) => /^[A-Za-z0-9_-]+$/.test(s) && !/^\d+$/.test(s))), 'rewriteIds.fields paths are valid dot paths (PB-25a: no empty/numeric/wildcard segments)', JSON.stringify(route.rewriteIds?.fields));
check(src.includes("ctx.inject(['zenRemote']"), "ctx.inject(['zenRemote']) present");
check(src.includes("ctx.effect(() => dispose, 'bots: zen-remote bridge declaration')"), 'dispose registered via ctx.effect');
check(!Object.keys(declaration).some((k) => !['plugin', 'version', 'routes'].includes(k)), 'no unknown declaration fields');
check(!Object.keys(route).some((k) => !['path', 'prefix', 'scope', 'sessionParam', 'stream', 'methods', 'maxBody', 'upgrade', 'locator', 'deny', 'rewriteIds'].includes(k)), 'no unknown route fields');

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll checks passed for ${pkg.name}@${pkg.version}.`);
