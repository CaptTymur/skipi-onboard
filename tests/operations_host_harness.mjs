// Headless harness for the On Board Operations / Outstandings host bridge.
//
// Loads the REAL inline <script> from dist/index.html and exercises
// makeHostApi(...).operations with a mocked fetch. Asserts: ONBOARD_TOKEN never
// leaks, plugin-supplied vessel/org fields are stripped, no vessel_imo query is
// accepted from plugin code, honest states, and permission gating.
//
//   node tests/operations_host_harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block found'); process.exit(1); }

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const noop = () => {};
const fakeEl = new Proxy({}, {
  get(t, p) {
    if (p === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
    if (p === 'style') return {};
    if (typeof p === 'string' && /^(getAttribute|setAttribute|removeAttribute|addEventListener|removeEventListener|appendChild|removeChild|remove|focus|blur|click|querySelector|querySelectorAll|setSelectionRange|select)$/.test(p)) return noop;
    if (p in t) return t[p];
    return '';
  },
  set(t, p, v) { t[p] = v; return true; },
});
globalThis.document = {
  getElementById: () => fakeEl,
  querySelector: () => fakeEl,
  querySelectorAll: () => [],
  createElement: () => fakeEl,
  head: fakeEl,
  body: fakeEl,
  documentElement: { getAttribute: () => 'light', setAttribute: noop },
};
globalThis.window = globalThis;
globalThis.__ONBOARD_NO_BOOT__ = true;

let fetchCalls = [];
let nextResponse = null;
function mkResponse({ status = 200, body = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}
globalThis.fetch = async (url, opt) => {
  fetchCalls.push({ url, opt });
  if (typeof nextResponse === 'function') return nextResponse(url, opt);
  return mkResponse({ status: 599, body: 'no mock set' });
};

const EXPORTS = [
  'makeHostApi', 'crewConfig', 'saveCrewConfig', 'crewConfigReady', 'crewBackendOn', 'crewLive',
  'hostOperationsListOwn', 'hostOperationsGetOwn', 'hostOperationsCreateOwn', 'hostOperationsUpdateOwn',
  'hostOperationsComment', 'operationsGateState', 'operationsOwnPayload', 'pluginHasPerm',
  'SkipiPlugins', 'OPERATIONS_VESSEL_STATUSES',
];
let M;
try {
  M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')();
} catch (e) {
  console.error('failed to load dist/index.html script:', e);
  process.exit(1);
}
for (const n of EXPORTS) {
  if (M[n] === undefined) { console.error('missing expected symbol from host:', n); process.exit(1); }
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function section(t) { console.log('\n# ' + t); }

const TOKEN = 'SECRET-OPERATIONS-TOKEN-DO-NOT-LEAK';
const API = 'https://api.example.test';
const IMO = '9001001';
function noLeak(obj, where) {
  ok(!JSON.stringify(obj).includes(TOKEN), where + ': result contains NO onboard token');
}
function configLive() {
  store.clear();
  localStorage.setItem('skipi-onboard-dev', '1');
  localStorage.setItem('skipi-onboard-crew-live', '1');
  M.saveCrewConfig({ api_base: API, onboard_token: TOKEN, vessel_imo: IMO, vessel_name: 'MV Ops Harness' });
}
function plugin(id, perms) { M.SkipiPlugins[id] = { manifest: { permissions: perms || [] } }; return M.makeHostApi(id); }

(async () => {
  section('committed flag stays OFF');
  store.clear();
  ok(M.crewBackendOn() === false, 'crewBackendOn() false with no dev override');

  section('dev override enables operations live path');
  configLive();
  ok(M.crewBackendOn() === true && M.crewConfigReady() === true && M.crewLive() === true, 'dev override + full config => live');

  const perms = [
    'vessel.context',
    'operations.items.read_own_vessel',
    'operations.items.create_own_vessel',
    'operations.items.update_own_vessel',
  ];
  let host = plugin('ops-full', perms);

  section('operations.listOwn() — no plugin vessel override, bearer host-injected');
  fetchCalls = [];
  nextResponse = () => mkResponse({ body: { items: [{ id: 'op1', vessel_imo: 9001001, status: 'open' }], total: 1, limit: 10, offset: 0, vessel_imo: 9001001 } });
  let listed = await host.operations.listOwn({ vessel_imo: 1234567, imo: 1234567, status: 'open', limit: 10 });
  ok(listed.ok && listed.state === 'ok' && listed.items.length === 1, 'returns items on 200');
  let call = fetchCalls[fetchCalls.length - 1];
  ok(call.url === API + '/api/onboard/operations/items?limit=10&offset=0&status=open', 'URL has no vessel_imo/imo query');
  ok(call.opt.headers.Authorization === 'Bearer ' + TOKEN, 'bearer injected by HOST');
  noLeak(listed, 'operations.listOwn');

  section('operations.listOwn() — honest states');
  nextResponse = () => mkResponse({ body: { items: [], total: 0, vessel_imo: 9001001 } });
  ok((await host.operations.listOwn()).state === 'empty', 'empty list => empty');
  nextResponse = () => mkResponse({ status: 403, body: 'forbidden' });
  let unauthorized = await host.operations.listOwn();
  ok(unauthorized.ok === false && unauthorized.state === 'unauthorized', '403 => unauthorized');
  noLeak(unauthorized, 'operations unauthorized');
  nextResponse = () => { throw new Error('ECONNREFUSED'); };
  ok((await host.operations.listOwn()).state === 'unavailable', 'fetch throw => unavailable');
  store.clear(); localStorage.setItem('skipi-onboard-dev', '1'); localStorage.setItem('skipi-onboard-crew-live', '1');
  ok((await host.operations.listOwn()).state === 'no_config', 'missing config => no_config');
  store.clear();
  M.saveCrewConfig({ api_base: API, onboard_token: TOKEN, vessel_imo: IMO });
  ok((await host.operations.listOwn()).state === 'backend_off', 'flag off => backend_off');
  configLive();
  ok((await plugin('ops-none', []).operations.listOwn()).state === 'permission_denied', 'read permission required');

  section('operations.createOwn() — strips org/vessel/status fields');
  host = plugin('ops-full-2', perms);
  fetchCalls = [];
  nextResponse = () => mkResponse({ status: 201, body: { id: 'op2', vessel_imo: 9001001, status: 'open', title: 'Deck crane limit switch' } });
  let created = await host.operations.createOwn({
    organization_id: 'wrong-org',
    vessel_imo: 1234567,
    imo: 1234567,
    status: 'closed',
    title: 'Deck crane limit switch',
    priority: 'normal',
  });
  ok(created.ok && created.state === 'queued_server_ack' && created.item.status === 'open', 'create returns server ack envelope');
  call = fetchCalls[fetchCalls.length - 1];
  ok(call.url === API + '/api/onboard/operations/items' && call.opt.method === 'POST', 'POST to onboard operations create endpoint');
  const createBody = JSON.parse(call.opt.body);
  ok(createBody.title === 'Deck crane limit switch' && createBody.priority === 'normal', 'allowed create fields pass through');
  ok(!('organization_id' in createBody) && !('vessel_imo' in createBody) && !('imo' in createBody) && !('status' in createBody), 'org/vessel/status stripped from create body');
  noLeak(created, 'operations.createOwn');
  ok((await host.operations.createOwn({})).state === 'bad_request', 'missing title => bad_request');
  ok((await plugin('ops-no-create', ['operations.items.read_own_vessel']).operations.createOwn({ title: 'x' })).state === 'permission_denied', 'create permission required');

  section('operations.updateOwn() — vessel statuses only');
  ok(M.OPERATIONS_VESSEL_STATUSES.join(',') === 'acknowledged,in_progress,waiting_shore,completed_by_vessel', 'vessel status allow-list fixed');
  ok((await host.operations.updateOwn('op2', { status: 'closed' })).state === 'bad_request', 'closed rejected before fetch');
  fetchCalls = [];
  nextResponse = () => mkResponse({ body: { id: 'op2', status: 'in_progress' } });
  let updated = await host.operations.updateOwn('op2', { status: 'in_progress', vessel_imo: 1234567, pic_name: 'Nope' });
  ok(updated.ok && updated.state === 'server_ack' && updated.item.status === 'in_progress', 'update returns server_ack');
  call = fetchCalls[fetchCalls.length - 1];
  ok(call.url === API + '/api/onboard/operations/items/op2' && call.opt.method === 'PATCH', 'PATCH to own item endpoint');
  const patchBody = JSON.parse(call.opt.body);
  ok(patchBody.status === 'in_progress' && !('vessel_imo' in patchBody) && !('pic_name' in patchBody), 'patch strips vessel and management-only fields');
  noLeak(updated, 'operations.updateOwn');
  ok((await plugin('ops-readonly', ['operations.items.read_own_vessel']).operations.updateOwn('op2', { status: 'in_progress' })).state === 'permission_denied', 'update permission required');

  section('operations.comment()');
  fetchCalls = [];
  nextResponse = () => mkResponse({ status: 201, body: { id: 'c1', body: 'Started inspection' } });
  let commented = await host.operations.comment('op2', ' Started inspection ');
  ok(commented.ok && commented.state === 'server_ack' && commented.comment.body === 'Started inspection', 'comment trims and returns server ack');
  call = fetchCalls[fetchCalls.length - 1];
  ok(call.url === API + '/api/onboard/operations/items/op2/comments' && call.opt.method === 'POST', 'POST to comments endpoint');
  ok(JSON.parse(call.opt.body).body === 'Started inspection', 'comment body sent only');
  noLeak(commented, 'operations.comment');
  ok((await host.operations.comment('op2', '   ')).state === 'bad_request', 'blank comment => bad_request');

  section('token confinement — no auth accessor on host surface');
  const surface = JSON.stringify(Object.keys(host)) + JSON.stringify(Object.keys(host.operations)) + JSON.stringify(Object.keys(host.vessel));
  ok(!surface.includes('token') && !surface.includes('Authorization'), 'host API exposes no token/auth accessor');
  ok(host.storage.get('skipi-onboard-crew-config') === null, 'plugin storage is namespaced');

  console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
