// Headless harness for the On Board main Crew screen live roster.
//
// Verifies:
// - main Crew screen no longer shows hard-coded zero when a live roster exists;
// - it renders linked crew rows without leaking the onboard token;
// - closing the live invite screen refreshes the roster from backend.
//
//   node tests/crew_roster_main_harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block'); process.exit(1); }

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const noop = () => {};
const els = new Map();
function elFor(id) {
  if (!els.has(id)) {
    els.set(id, {
      innerHTML: '', textContent: '', value: '', style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      setAttribute: noop, getAttribute: () => null, addEventListener: noop,
      appendChild: noop, remove: noop, focus: noop,
    });
  }
  return els.get(id);
}

globalThis.document = {
  getElementById: (id) => elFor(id),
  querySelector: (sel) => (sel === 'main' ? elFor('main') : elFor('_q')),
  querySelectorAll: () => [],
  createElement: () => elFor('_c'),
  head: elFor('_head'),
  body: elFor('_body'),
  documentElement: { getAttribute: () => 'light', setAttribute: noop },
};
globalThis.window = globalThis;
globalThis.__ONBOARD_NO_BOOT__ = true;

let fetchCalls = [];
let rosterItems = [];
globalThis.fetch = async (url, opt) => {
  fetchCalls.push({ url, opt });
  if (String(url).includes('/api/onboard/crew/invite')) {
    return {
      status: 201,
      ok: true,
      async json() {
        return {
          code: 'ABCD1234',
          qr_payload: 'skipi-crew:1:onboard:ABCD1234',
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          vessel_imo: '7533197',
        };
      },
      async text() { return ''; },
    };
  }
  if (String(url).includes('/api/onboard/crew?vessel_imo=7533197')) {
    return { status: 200, ok: true, async json() { return { items: rosterItems }; }, async text() { return ''; } };
  }
  throw new Error(`unexpected fetch ${url}`);
};

const EXPORTS = [
  'renderCrew', 'openPairing', 'closePairing', 'crewLoadRoster', 'crewLive',
  'saveCrewConfig', 'stopCrewInviteTimer', 'stopPairingTimer', 'crewState',
];
let M;
try { M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')(); }
catch (e) { console.error('load failed:', e); process.exit(1); }
for (const n of EXPORTS) if (M[n] === undefined) { console.error('missing symbol:', n); process.exit(1); }

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}
const section = (title) => console.log('\n# ' + title);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

store.clear();
localStorage.setItem('skipi-onboard-dev', '1');
localStorage.setItem('skipi-onboard-crew-live', '1');
M.saveCrewConfig({
  api_base: 'https://api.example.test',
  onboard_token: 'ONBOARD-TOKEN-SECRET',
  vessel_imo: '7533197',
  vessel_name: 'M/V AVDEEVKA',
});

section('main Crew screen renders live roster');
rosterItems = [{
  id: 'crew-1',
  vessel_imo: 7533197,
  status: 'linked',
  display_name: 'Tymur Rudov',
  rank: 'master',
  linked_at: '2026-06-27T18:17:19Z',
}];
ok(M.crewLive() === true, 'dev live config enables crewLive');
M.crewState.roster = rosterItems;
M.renderCrew();
let html = els.get('scr-content').innerHTML;
ok(html.includes('Tymur Rudov'), 'linked seafarer is visible on main Crew screen');
ok(html.includes('master'), 'rank is visible');
ok(html.includes('Linked crew'), 'stats section rendered');
ok(html.includes('>1<') || html.includes('crew-stat-v">1'), 'live count is 1');
ok(!html.includes('ONBOARD-TOKEN-SECRET'), 'token is not rendered');

section('closePairing refreshes roster');
fetchCalls = [];
rosterItems = [];
M.openPairing();
await tick();
ok(fetchCalls.some((c) => String(c.url).includes('/api/onboard/crew/invite')), 'invite call made');
rosterItems = [{
  id: 'crew-2',
  vessel_imo: 7533197,
  status: 'linked',
  display_name: 'New Crew',
  rank: 'AB',
  linked_at: '2026-06-27T18:19:00Z',
}];
M.closePairing();
await tick();
await tick();
html = els.get('scr-content').innerHTML;
ok(fetchCalls.some((c) => String(c.url).includes('/api/onboard/crew?vessel_imo=7533197')), 'closePairing requests roster');
ok(html.includes('New Crew') && html.includes('AB'), 'refreshed crew row is visible after closing invite');

M.stopCrewInviteTimer();
M.stopPairingTimer();

console.log('\n' + (fail === 0 ? 'crew_roster_main_harness: GREEN' : 'crew_roster_main_harness: FAIL') + ` (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
