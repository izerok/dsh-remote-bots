// dsh-remote-bots 1.0.0 — merged single plugin.
// Vendored from kadaliao/dsh-bots@0.17.1 and KyoMio/dsh-zen-remote@2.5.4
// (see VENDORING.md). One server entry applies both halves; the two halves
// share one flat config object because their keys do not intersect
// (bots: workdir/workdirs/language; zen-remote: role/port/host/...).
import { apply as applyBots } from './src/bots/index.js';
import { apply as applyZen } from './src/zen-remote/lib/index.js';

export const name = 'dsh-remote-bots';
export const inject = ['tools']; // bots' requirement; zen-remote exports no inject
export { Config } from './src/zen-remote/lib/config.js';

export function apply(ctx, config = {}) {
  const cfg = config && typeof config === 'object' ? config : {};
  applyBots(ctx, cfg, {});
  applyZen(ctx, cfg);
}
