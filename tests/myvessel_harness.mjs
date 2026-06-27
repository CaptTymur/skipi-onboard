// Headless harness for the On Board "My Vessel" module + vessel selection.
//
// Loads the REAL inline <script> from dist/index.html, stubs the browser globals,
// and exercises the vessel lookup/select data path against a mocked fetch.
// Asserts: IMO normalization, public GET /api/vessels/{imo} envelope + honest
// states, onboard_token attached only when present and NEVER returned to a
// caller, config gating, and read-only module rendering (no edit affordance).
//
//   node tests/myvessel_harness.mjs
//
// No backend, no network, no edit capability. Pure logic verification.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block found'); process.exit(1); }

// ---- minimal browser stubs (elements keep a real innerHTML so renders don't throw) ----
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
      setAttribute: noop, getAttribute: () => null, addEventListener: noop, appendChild: noop, remove: noop, focus: noop,
    });
  }
  return els.get(id);
}
globalThis.document = {
  getElementById: (id) => elFor(id),
  querySelector: () => elFor('_q'),
  querySelectorAll: () => [],
  createElement: () => elFor('_c'),
  head: elFor('_head'), body: elFor('_body'),
  documentElement: { getAttribute: () => 'light', setAttribute: noop },
};
globalThis.window = globalThis;
globalThis.__ONBOARD_NO_BOOT__ = true;

let fetchCalls = [];
let nextResponse = null;
function mkResponse({ status = 200, body = {} } = {}) {
  return { status, ok: status >= 200 && status < 300, async json() { return body; }, async text() { return typeof body === 'string' ? body : JSON.stringify(body); } };
}
globalThis.fetch = async (url, opt) => { fetchCalls.push({ url, opt }); return (typeof nextResponse === 'function') ? nextResponse(url, opt) : mkResponse({ status: 599, body: 'no mock' }); };

const EXPORTS = ['crewConfig', 'saveCrewConfig', 'normalizeImo', 'joinNC', 'vesselFetch', 'vesselConfigReady', 'myVesselHtml', 'loadMyVessel'];
let M;
try { M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')(); }
catch (e) { console.error('failed to load script:', e); process.exit(1); }
for (const n of EXPORTS) if (M[n] === undefined) { console.error('missing symbol:', n); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log('\n# ' + t);
const tick = () => new Promise((r) => setTimeout(r, 0));

const TOKEN = 'SECRET-ONBOARD-TOKEN-DO-NOT-LEAK';
const API = 'https://api.example.test';
const VESSEL = {
  imo: 9234567, name_current: 'MV Test Carrier', flag_current: 'Panama', vessel_type: 'Bulk Carrier',
  vessel_subtype: 'Handysize', status: 'active', built_year: 2012, gross_tonnage: 23456, dwt: 35000,
  builder_origin: 'Japan', builder_yard: 'Test Yard', class_society: 'DNV',
  current_owner_name: 'Test Owner Ltd', current_owner_country: 'Greece',
  current_technical_manager_name: 'Test TM', current_technical_manager_country: 'Cyprus',
  operator_company: 'Test Operator', review_count: 0, facts: [], events: [], sanctions: [],
  rating_access: { unlocked: false },
};

(async () => {
  section('normalizeImo');
  ok(M.normalizeImo(' IMO 92 34567 ') === '9234567', 'strips non-digits');
  ok(M.normalizeImo('123456789') === '1234567', 'caps at 7 digits');
  ok(M.normalizeImo(null) === '', 'null => empty');

  section('joinNC');
  ok(M.joinNC('Owner', 'Greece') === 'Owner (Greece)', 'name + country');
  ok(M.joinNC('Owner', null) === 'Owner', 'name only');
  ok(M.joinNC(null, 'Greece') === '', 'no name => empty');

  section('vesselConfigReady — needs only api_base (public read, no dev flag)');
  store.clear();
  ok(M.vesselConfigReady() === false, 'false with no api_base');
  M.saveCrewConfig({ api_base: API });
  ok(M.vesselConfigReady() === true, 'true once api_base set (no token / no dev flag required)');

  section('vesselFetch — public read, token-safe envelope');
  // no token configured -> no Authorization header sent
  store.clear(); M.saveCrewConfig({ api_base: API });
  fetchCalls = [];
  nextResponse = () => mkResponse({ body: VESSEL });
  let r = await M.vesselFetch('9234567');
  ok(r.ok && r.state === 'ok' && r.vessel.imo === 9234567, '200 => ok + vessel');
  ok(fetchCalls[0].url === API + '/api/vessels/9234567', 'GET /api/vessels/{imo}');
  ok(!('Authorization' in (fetchCalls[0].opt.headers || {})), 'no token configured => no Authorization header');
  // token configured -> bearer injected by host, but NEVER returned
  store.clear(); M.saveCrewConfig({ api_base: API, onboard_token: TOKEN });
  fetchCalls = [];
  nextResponse = () => mkResponse({ body: VESSEL });
  r = await M.vesselFetch('9234567');
  ok(fetchCalls[0].opt.headers.Authorization === 'Bearer ' + TOKEN, 'token present => host injects bearer');
  ok(!JSON.stringify(r).includes(TOKEN), 'vesselFetch result contains NO token');
  // honest states
  nextResponse = () => mkResponse({ status: 404, body: 'nope' });
  ok((await M.vesselFetch('1111111')).state === 'not_found', '404 => not_found');
  nextResponse = () => mkResponse({ status: 500, body: 'boom' });
  ok((await M.vesselFetch('1111111')).state === 'unavailable', '500 => unavailable');
  nextResponse = () => { throw new Error('ECONNREFUSED'); };
  ok((await M.vesselFetch('1111111')).state === 'unavailable', 'network throw => unavailable');

  section('module render — no vessel selected');
  store.clear(); M.saveCrewConfig({ api_base: API });
  let html = M.myVesselHtml();
  ok(html.includes('Судно не выбрано'), 'empty state when no vessel_imo');
  ok(html.includes("showSettings('vessel')"), 'CTA points to settings vessel page');

  section('module render — selected + live data, READ-ONLY');
  store.clear(); M.saveCrewConfig({ api_base: API, vessel_imo: '9234567', vessel_name: 'MV Test Carrier', vessel_type: 'Bulk Carrier', vessel_flag: 'Panama' });
  nextResponse = () => mkResponse({ body: VESSEL });
  M.loadMyVessel(true);
  await tick();
  html = M.myVesselHtml();
  ok(html.includes('MV Test Carrier'), 'shows vessel name');
  ok(html.includes('Bulk Carrier') && html.includes('Panama') && html.includes('DNV'), 'shows DB particulars (type/flag/class)');
  ok(html.includes('Только чтение'), 'read-only note present');
  ok(!/<input|contenteditable|Сохранить|Редактировать|onclick="vessel(Save|Edit)/.test(html), 'NO edit affordance in module (read-only)');
  ok(html.includes('Оценки скрыты'), 'locked Skipi scores shown honestly (onboard token does not unlock)');
  ok(!JSON.stringify(els.get('scr-content').innerHTML).includes(TOKEN), 'rendered content carries no token');

  section('module render — not_found honest state');
  store.clear(); M.saveCrewConfig({ api_base: API, vessel_imo: '1111111' });
  nextResponse = () => mkResponse({ status: 404, body: 'nope' });
  M.loadMyVessel(true);
  await tick();
  ok(M.myVesselHtml().includes('не найдено в базе Skipi'), 'not_found surfaces honest message (no fabricated card)');

  section('module render — api_base missing honest state');
  store.clear(); M.saveCrewConfig({ vessel_imo: '9234567', vessel_name: 'X' });
  ok(M.myVesselHtml().includes('API base не задан'), 'no api_base => honest "configure" state, no fake data');

  console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
