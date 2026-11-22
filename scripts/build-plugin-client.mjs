// Build plugin/client.js for the merged dsh-remote-bots plugin.
// Concatenates the two vendored client bundles and appends a small wrapper
// that registers the merged id 'dsh-remote-bots' and applies both halves.
// This script contains no upstream code; the two segments are read from
// plugin/src/ at build time. Run: node scripts/build-plugin-client.mjs
// (from the repo root). Verifies the output with `node --check`.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'plugin');

const botsClient = readFileSync(path.join(pluginDir, 'src/bots/client.js'), 'utf-8');
const zenClient = readFileSync(path.join(pluginDir, 'src/zen-remote/lib/client.js'), 'utf-8');

// Sanity: both segments must register their own ids, otherwise the wrapper's
// require() calls below would have nothing to materialize.
for (const [label, text, id] of [
  ['bots', botsClient, "'@kadaliao/dsh-bots'"],
  ['zen-remote', zenClient, '"dsh-zen-remote"'],
]) {
  if (!text.includes(`__ModuleLoader__.load({`) || !text.includes(id)) {
    throw new Error(`${label} client segment does not register id ${id}`);
  }
}

const header = `// GENERATED — do not edit by hand.
// Built by scripts/build-plugin-client.mjs from plugin/src/bots/client.js
// + plugin/src/zen-remote/lib/client.js + the wrapper below.
// Regenerate after re-vendoring either half.
`;
const wrapper = `
// --- merged wrapper: register the single plugin id and apply both halves ---
window.__ModuleLoader__.load({
  id: 'dsh-remote-bots',
  factory(require) {
    return {
      inject: ['slots', 'locale', 'layout', 'sessionLogDownload', 'sessions', 'workspaces'],
      apply(ctx) {
        const bots = require('@kadaliao/dsh-bots');
        const zen = require('dsh-zen-remote');
        if (bots && typeof bots.apply === 'function') bots.apply(ctx);
        if (zen && typeof zen.apply === 'function') zen.apply(ctx);
      },
    };
  },
});
`;

const out = path.join(pluginDir, 'client.js');
writeFileSync(out, header + botsClient + '\n' + zenClient + wrapper);
execFileSync('node', ['--check', out], { stdio: 'inherit' });
console.log(`build-plugin-client: wrote ${out} (${botsClient.length} + ${zenClient.length} + wrapper bytes)`);
