/**
 * Team-wide settings of the bots plugin, kept in `settings.json` beside the
 * roster: how the dispatcher works, how many tasks (tickets) run at once and
 * when they are judged stalled or archived, when a bot starts a new topic by
 * itself, how memory is written and consolidated, the prices the usage
 * view counts with, and how the panel shows what bots say to each other.
 *
 * @module @kadaliao/dsh-bots/lib/settings
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULTS = Object.freeze({
  /**
   * How the dispatcher works in its home conversation: it only understands, hands out (each
   * delegation is a ticket with its own conversation) and reports. Always 'router' since 0.11: the
   * 0.7 'hands-on' mode is gone, and a stored one reads as 'router' (with the one-time notice).
   */
  dispatcher: 'router',
  tickets: Object.freeze({
    /** Tickets whose conversations run at once; past this they queue (a person's follow-up may take one more). */
    maxWorking: 4,
    /** Minutes a working ticket may stay quiet before the watchdog asks for a report, and again before it is stalled. */
    stallMinutes: 20,
    /** Hours an ended ticket keeps its conversation before it is archived; 0 = at the next upkeep. */
    archiveHours: 24,
  }),
  /**
   * The one-time panel notice that an upgraded team now runs in router mode: 'pending' until the
   * user dismisses it, 'dismissed' after; null before the first run of 0.8 decided. A team still set
   * to the old hands-on mode gets it (again) when it is moved to router mode (0.11).
   */
  routerNotice: null,
  /**
   * The one-time panel notice that team templates lost their leads (0.11.1), shown while a team
   * hired before still has a lead that is not the dispatcher: null until the user answers it,
   * 'dismissed' after (whether the leads were removed or kept).
   */
  leadNotice: null,
  /** 'given' once teams hired before 0.15 got the lead their template names (at the first start of 0.15); null before. */
  teamLeads: null,
  /** Teams whose new lead (0.16) the user turned down: team id → 'dismissed'. */
  leadOffers: Object.freeze({}),
  /**
   * The person's own words for teams (Bots 0.17), team id → `{name?, tagline?, color?, custom?, at?}`:
   * over a hired template team, what it is called and shown as instead of the template's; with
   * `custom: true`, a team the person made, which has no template (its `name` is required).
   */
  teams: Object.freeze({}),
  topics: Object.freeze({
    /** A conversation quiet for this many hours starts a new topic before its next task; 0 = never. */
    idleHours: 6,
    /** A conversation whose prompt reached this many thousand tokens starts a new topic; 0 = never. */
    maxContextK: 128,
  }),
  memory: Object.freeze({
    /** Summarize every finished task into the bot's memory. */
    auto: true,
    /** The model memory work runs on; null = each bot's own model. */
    model: null,
    /** Consolidate memories once a day ("dreaming"). */
    dream: true,
    /** Local time of the daily consolidation, HH:MM. */
    dreamTime: '03:00',
  }),
  /** Prices per million tokens by model id (lowercase): {input, output, cacheRead?, cacheWrite?, currency}. */
  prices: Object.freeze({}),
  /** Keep a ChatGPT login borrowed from the Codex CLI in sync with ~/.codex/auth.json. */
  codex: Object.freeze({ sync: false, route: false }),
  display: Object.freeze({
    /**
     * Messages between bots in a chat (delegations, reports, DMs): 'line' (who to whom, the task or
     * first sentence, its stage and time), 'short' (that and two lines of the text), 'full' (all of it).
     */
    botMessages: 'line',
  }),
});

/** The levels of `display.botMessages`, least to most. */
export const BOT_MESSAGE_LEVELS = Object.freeze(['line', 'short', 'full']);

const num = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const clock = (v, d) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : d;
};

/** One price row, or null when it names no usable price. */
export function normalizePrice(p) {
  if (!p || typeof p !== 'object') return null;
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Number(x.toPrecision(10)) : undefined;
  };
  const input = n(p.input);
  const output = n(p.output);
  if (input === undefined || output === undefined) return null;
  const cacheRead = n(p.cacheRead);
  const cacheWrite = n(p.cacheWrite);
  return {
    input,
    output,
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {}),
    currency: p.currency === 'CNY' ? 'CNY' : 'USD',
  };
}

export const TEAM_ID_RE = /^[a-z0-9-]{1,40}$/;
export const TEAM_COLOR_RE = /^#[0-9a-f]{6}$/i;
/** Characters kept of a team's name and of its description. */
export const MAX_TEAM_NAME = 60;
export const MAX_TEAM_TAGLINE = 300;
/** Teams kept at most (custom ones and renamed templates together). */
export const MAX_TEAMS = 100;

/** One team's own words, or null when it holds nothing usable (a custom team needs a name). */
export function normalizeTeamMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const name = typeof m.name === 'string' ? m.name.replace(/\s+/g, ' ').trim().slice(0, MAX_TEAM_NAME) : '';
  const tagline = typeof m.tagline === 'string' ? m.tagline.trim().slice(0, MAX_TEAM_TAGLINE) : '';
  const color = typeof m.color === 'string' && TEAM_COLOR_RE.test(m.color) ? m.color.toLowerCase() : '';
  const custom = m.custom === true;
  if (custom && !name) return null;
  const out = { ...(name ? { name } : {}), ...(tagline ? { tagline } : {}), ...(color ? { color } : {}), ...(custom ? { custom: true } : {}), ...(Number.isFinite(m.at) ? { at: m.at } : {}) };
  return Object.keys(out).some((k) => k !== 'at') ? out : null;
}

/** Every field present, values clamped. */
export function normalizeSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const t = s.topics ?? {};
  const m = s.memory ?? {};
  const tk = s.tickets ?? {};
  const prices = {};
  if (s.prices && typeof s.prices === 'object') {
    for (const [k, v] of Object.entries(s.prices).slice(0, 300)) {
      const key = String(k).trim().toLowerCase().slice(0, 200);
      const p = normalizePrice(v);
      if (key && p) prices[key] = p;
    }
  }
  const model = m.model && typeof m.model === 'object' && typeof m.model.provider === 'string' && m.model.provider && typeof m.model.model === 'string' && m.model.model ? { provider: m.model.provider.slice(0, 200), model: m.model.model.slice(0, 200) } : null;
  return {
    dispatcher: 'router',
    tickets: {
      maxWorking: Math.round(num(tk.maxWorking, DEFAULTS.tickets.maxWorking, 1, 32)),
      stallMinutes: Math.round(num(tk.stallMinutes, DEFAULTS.tickets.stallMinutes, 1, 24 * 60)),
      archiveHours: num(tk.archiveHours, DEFAULTS.tickets.archiveHours, 0, 24 * 30),
    },
    // A team that had picked hands-on is told once that its dispatcher now only hands out the work.
    routerNotice: s.dispatcher === 'hands-on' ? 'pending' : s.routerNotice === 'pending' || s.routerNotice === 'dismissed' ? s.routerNotice : null,
    leadNotice: s.leadNotice === 'dismissed' ? 'dismissed' : null,
    teamLeads: s.teamLeads === 'given' ? 'given' : null,
    leadOffers: Object.fromEntries(Object.entries(s.leadOffers && typeof s.leadOffers === 'object' ? s.leadOffers : {}).filter(([k, v]) => /^[a-z0-9-]{1,40}$/.test(k) && v === 'dismissed')),
    teams: Object.fromEntries(
      Object.entries(s.teams && typeof s.teams === 'object' && !Array.isArray(s.teams) ? s.teams : {})
        .filter(([k]) => TEAM_ID_RE.test(k))
        .map(([k, v]) => [k, normalizeTeamMeta(v)])
        .filter(([, v]) => v)
        .slice(0, MAX_TEAMS),
    ),
    topics: {
      idleHours: num(t.idleHours, DEFAULTS.topics.idleHours, 0, 24 * 30),
      maxContextK: Math.round(num(t.maxContextK, DEFAULTS.topics.maxContextK, 0, 4096)),
    },
    memory: {
      auto: typeof m.auto === 'boolean' ? m.auto : DEFAULTS.memory.auto,
      model,
      dream: typeof m.dream === 'boolean' ? m.dream : DEFAULTS.memory.dream,
      dreamTime: clock(m.dreamTime, DEFAULTS.memory.dreamTime),
    },
    prices,
    codex: { sync: s.codex?.sync === true, route: s.codex?.route === true },
    display: { botMessages: BOT_MESSAGE_LEVELS.includes(s.display?.botMessages) ? s.display.botMessages : DEFAULTS.display.botMessages },
  };
}

/** Deep-merge a patch into settings (objects merge, everything else replaces). */
function merge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  // Prices and teams replace as a whole: a team taken out is gone.
  for (const [k, v] of Object.entries(patch)) out[k] = k === 'prices' || k === 'teams' ? v : merge(out[k], v);
  return out;
}

/** The settings file under `dir`, re-read when another process changed it. */
export function createSettings(dir) {
  const file = join(dir, 'settings.json');
  let seen = -2;
  let value = normalizeSettings({});
  const mtime = () => {
    try {
      return statSync(file).mtimeMs;
    } catch {
      return -1;
    }
  };
  const reload = () => {
    const now = mtime();
    if (now === seen) return;
    seen = now;
    try {
      value = normalizeSettings(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      value = normalizeSettings({});
    }
  };
  return {
    get() {
      reload();
      return value;
    },
    /** Merge `patch` (prices and teams replace as a whole) and save; returns the new settings. */
    save(patch) {
      reload();
      value = normalizeSettings(merge(value, patch));
      mkdirSync(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
      renameSync(tmp, file);
      seen = mtime();
      return value;
    },
  };
}
