#!/usr/bin/env node
// Static validator for the merged single plugin in plugin/.
// Checks the package manifest, the cordis patch row, both vendored halves,
// the generated client bundle, and the zen-remote bridge declaration.
// No DSH, no network, no dependencies.
// Usage: node scripts/verify-plugin.mjs
// Exit 0 = all checks pass, 1 = any check fails.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pluginDir = join(root, 'plugin');
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const read = (path) => readFileSync(join(pluginDir, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const pkg = readJson('package.json');
check(pkg.name === 'dsh-remote-bots', 'package name', pkg.name);
check(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(pkg.version), 'package version is semver', pkg.version);
check(pkg.type === 'module', 'package type is module', pkg.type);
check(pkg.main === './index.js', 'main is ./index.js', pkg.main);
check(pkg.exports?.['.'] === './index.js', 'exports["."] is ./index.js', JSON.stringify(pkg.exports?.['.']));
check(pkg.exports?.['./client'] === './client.js', 'exports["./client"] is ./client.js', pkg.exports?.['./client']);
check(pkg.exports?.['./icon'] === './icon.svg', 'exports["./icon"] is ./icon.svg', pkg.exports?.['./icon']);
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch is ./cordis.patch.yml', pkg.dsh?.bundle?.patch);
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform is web', pkg.dsh?.client?.platform);
check(typeof pkg.dependencies?.['web-push'] === 'string', 'declares the web-push dependency', pkg.dependencies?.['web-push']);
check(
  typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.includes('>=0.2.1-alpha.2') && pkg.engines.dsh.includes('<0.3.0'),
  'engines.dsh pins the 0.2.x range',
  pkg.engines?.dsh,
);

const required = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'VENDORING.md',
  'LICENSES/dsh-bots-MIT.txt',
  'LICENSES/dsh-zen-remote-MIT.txt',
  'src/bots/index.js',
  'src/bots/client.js',
  'src/bots/package.json',
  'src/zen-remote/lib/index.js',
  'src/zen-remote/lib/client.js',
  'src/zen-remote/package.json',
];
for (const path of required) check(existsSync(join(pluginDir, path)), `required file present: ${path}`);

const botsPkg = existsSync(join(pluginDir, 'src/bots/package.json')) ? readJson('src/bots/package.json') : {};
const zenPkg = existsSync(join(pluginDir, 'src/zen-remote/package.json')) ? readJson('src/zen-remote/package.json') : {};
check(botsPkg.name === '@kadaliao/dsh-bots', 'vendored bots package name', botsPkg.name);
check(zenPkg.name === 'dsh-zen-remote', 'vendored zen-remote package name', zenPkg.name);
check(typeof botsPkg.version === 'string' && typeof zenPkg.version === 'string', 'vendored component versions readable', `${botsPkg.version} / ${zenPkg.version}`);

const cordis = read('cordis.patch.yml');
check((cordis.match(/- insert:/g) ?? []).length === 1, 'cordis patch declares exactly one insert', String((cordis.match(/- insert:/g) ?? []).length));
check(/^\s+- id: dsh-remote-bots$/m.test(cordis), 'cordis row id is dsh-remote-bots');
check(/^\s+name: dsh-remote-bots$/m.test(cordis), 'cordis row name is dsh-remote-bots');
check(/^\s+enabled: true$/m.test(cordis), 'cordis row enables the plugin');
check(/^\s+workdir: ''$/m.test(cordis), 'cordis row keeps workdir empty');
check(/^\s+workdirs: \{\}$/m.test(cordis), 'cordis row keeps workdirs {}');

const index = read('index.js');
check(index.includes("export const name = 'dsh-remote-bots'"), 'server entry exports the merged name');
check(index.includes("from './src/bots/index.js'"), 'server entry imports the bots half');
check(index.includes("from './src/zen-remote/lib/index.js'"), 'server entry imports the zen-remote half');
check(index.includes('export function apply('), 'server entry exports apply()');

const client = read('client.js');
check(client.startsWith('// GENERATED'), 'client bundle carries the generated header');
check(client.includes("id: 'dsh-remote-bots'"), 'client bundle registers the merged id');
check(client.includes("require('@kadaliao/dsh-bots')"), 'client wrapper requires the bots half');
check(client.includes("require('dsh-zen-remote')"), 'client wrapper requires the zen-remote half');

const botsIndex = read('src/bots/index.js');
const declMatch = botsIndex.match(/const declaration = \{([\s\S]*?)\n    \};/);
check(Boolean(declMatch), 'bridge declaration literal present in src/bots/index.js');
if (declMatch) {
  const declaration = new Function(`return {${declMatch[1]}};`)();
  check(declaration.plugin === '@kadaliao/dsh-bots', 'declaration.plugin keeps the upstream consent key', declaration.plugin);
  check(declaration.version === pkg.version, 'declaration.version tracks the merged package version', `${declaration.version} / ${pkg.version}`);
  check(Array.isArray(declaration.routes) && declaration.routes.length === 1, 'declaration has exactly one route', String(declaration.routes?.length));
  const route = declaration.routes?.[0] ?? {};
  check(route.path === '/__dsh_bots', 'route.path is /__dsh_bots', route.path);
  check(route.prefix === true, 'route.prefix is true');
  check(route.scope === 'server', "route.scope is 'server'", route.scope);
  check(JSON.stringify([...(route.methods ?? [])].sort()) === JSON.stringify(['GET', 'POST']), 'route.methods are GET+POST', JSON.stringify(route.methods));
  check(route.maxBody === 41943040, 'route.maxBody is 40 MiB', String(route.maxBody));
  check(JSON.stringify(route.rewriteIds) === JSON.stringify({ fields: ['sessionId'] }), 'route.rewriteIds rewrites sessionId', JSON.stringify(route.rewriteIds));
  check(!Object.keys(declaration).some((key) => !['plugin', 'version', 'routes'].includes(key)), 'declaration has no unknown fields');
}
check(botsIndex.includes("ctx.inject(['zenRemote']"), "bots half uses ctx.inject(['zenRemote'])");
check(botsIndex.includes("ctx.effect(() => dispose, 'bots: zen-remote bridge declaration')"), 'bridge dispose is registered via ctx.effect');

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll checks passed for dsh-remote-bots@${pkg.version} (bots ${botsPkg.version}, zen-remote ${zenPkg.version}).`);
