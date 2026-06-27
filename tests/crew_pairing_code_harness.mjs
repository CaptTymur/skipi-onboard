// Headless harness for On Board crew invite QR/manual-code surface.
//
// Verifies:
// - normal OFF/local preview does not pretend to have a backend crew code;
// - dev live crew config calls /api/onboard/crew/invite and renders a visible
//   manual code next to the QR surface;
// - the manual code is the short backend code, not the full QR payload.
//
//   node tests/crew_pairing_code_harness.mjs

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
globalThis.fetch = async (url, opt) => {
  fetchCalls.push({ url, opt });
  return {
    status: 201,
    ok: true,
    async json() {
      return {
        code: 'ABCD-1234',
        qr_payload: 'skipi-crew:1:onboard:ABCD-1234',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        vessel_imo: '7533197',
      };
    },
    async text() { return ''; },
  };
};

const EXPORTS = [
  'openPairing', 'closePairing', 'crewLive', 'crewConfig', 'saveCrewConfig',
  'crewInviteManualCode', 'crewInvitePayload', 'stopCrewInviteTimer', 'stopPairingTimer',
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

section('OFF/local preview — no fake manual code');
store.clear(); fetchCalls = [];
M.openPairing();
let html = els.get('scr-content').innerHTML;
ok(fetchCalls.length === 0, 'local preview makes no backend calls');
ok(html.includes('data-qa="onboard-local-pairing-preview"'), 'local preview rendered');
ok(html.includes('data-qa="onboard-local-pairing-no-code"'), 'explicit no-code warning rendered');
ok(!html.includes('data-qa="onboard-crew-manual-code"'), 'does not render live manual-code hook');
M.closePairing();

section('dev live path — QR plus visible manual code');
store.clear(); fetchCalls = [];
localStorage.setItem('skipi-onboard-dev', '1');
localStorage.setItem('skipi-onboard-crew-live', '1');
M.saveCrewConfig({
  api_base: 'https://api.example.test',
  onboard_token: 'ONBOARD-TOKEN-SECRET',
  vessel_imo: '7533197',
  vessel_name: 'M/V AVDEEVKA',
});
ok(M.crewLive() === true, 'dev live config enables crewLive without source flag flip');
M.openPairing();
await tick();
html = els.get('scr-content').innerHTML;
ok(fetchCalls.length === 1, 'requests one live invite');
ok(fetchCalls[0].url === 'https://api.example.test/api/onboard/crew/invite', 'calls /api/onboard/crew/invite');
ok(fetchCalls[0].opt.method === 'POST', 'invite call is POST');
ok(fetchCalls[0].opt.headers.Authorization === 'Bearer ONBOARD-TOKEN-SECRET', 'bearer used only in host fetch');
ok(html.includes('data-qa="onboard-crew-live-invite"'), 'live invite screen rendered');
ok(html.includes('data-qa="onboard-crew-manual-code"'), 'manual-code hook rendered');
ok(html.includes('ABCD-1234'), 'short manual code visible');
ok(!html.includes('ONBOARD-TOKEN-SECRET'), 'token is not rendered');
ok(M.crewInviteManualCode() === 'ABCD-1234', 'manual code returns short backend code');
ok(M.crewInvitePayload() === 'skipi-crew:1:onboard:ABCD-1234', 'QR payload remains namespaced');
M.stopCrewInviteTimer();
M.stopPairingTimer();

console.log('\n' + (fail === 0 ? 'crew_pairing_code_harness: GREEN' : 'crew_pairing_code_harness: FAIL') + ` (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
