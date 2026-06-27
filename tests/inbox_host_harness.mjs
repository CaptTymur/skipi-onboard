// Headless harness for the On Board receiver host bridge (ship-photo-collection).
//
// Loads the REAL inline <script> from dist/index.html (no build step), stubs the
// browser globals it needs, and exercises makeHostApi(...).vessel / .inbox with
// a mocked fetch. Asserts: token never leaks to plugins, imo is forced, every
// honest state, permission gating, and the /media-only URL guard.
//
//   node tests/inbox_host_harness.mjs
//
// No backend, no network, no real photos. Pure logic verification.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');

// ---- extract the largest <script> block (same heuristic as the CI syntax-check) ----
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block found'); process.exit(1); }

// ---- minimal browser stubs ----
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
globalThis.__ONBOARD_NO_BOOT__ = true; // skip the DOM-heavy boot tail

// ---- configurable mock fetch ----
let fetchCalls = [];
let nextResponse = null; // function(url, opt) -> {status, ok, body} | throws
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

// ---- load the shipped code and pull out the symbols under test ----
const EXPORTS = [
  'makeHostApi', 'crewConfig', 'saveCrewConfig', 'crewConfigReady', 'crewBackendOn', 'crewLive',
  'hostInboxList', 'hostInboxGet', 'hostInboxSetStatus', 'hostInboxPhotoUrl',
  'inboxGateState', 'inboxMediaUrl', 'pluginHasPerm', 'SkipiPlugins', 'INBOX_FORWARD_STATUSES',
];
let M;
try {
  // All EXPORTS are top-level function/var declarations in the shipped script,
  // so ES6 shorthand returns them straight out of the Function scope.
  M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')();
} catch (e) {
  console.error('failed to load dist/index.html script:', e);
  process.exit(1);
}
for (const n of EXPORTS) {
  if (M[n] === undefined) { console.error('missing expected symbol from host:', n); process.exit(1); }
}

// ---- tiny assert framework ----
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function section(t) { console.log('\n# ' + t); }

const TOKEN = 'SECRET-ONBOARD-TOKEN-DO-NOT-LEAK';
const API = 'https://api.example.test';
const IMO = '9999999';
function noLeak(obj, where) {
  ok(!JSON.stringify(obj).includes(TOKEN), where + ': result contains NO onboard token');
}
function configLive() { // dev-mode override on + full config = live path WITHOUT flipping CREW_API_CONNECTED
  store.clear();
  localStorage.setItem('skipi-onboard-dev', '1');
  localStorage.setItem('skipi-onboard-crew-live', '1');
  M.saveCrewConfig({ api_base: API, onboard_token: TOKEN, vessel_imo: IMO, vessel_name: 'MV Harness' });
}
function plugin(id, perms) { M.SkipiPlugins[id] = { manifest: { permissions: perms || [] } }; return M.makeHostApi(id); }

(async () => {
  section('committed flag stays OFF (no source flip)');
  store.clear();
  ok(M.crewBackendOn() === false, 'crewBackendOn() false with no dev override (CREW_API_CONNECTED not flipped)');

  section('dev override enables the live path without flipping the constant');
  configLive();
  ok(M.crewBackendOn() === true && M.crewConfigReady() === true && M.crewLive() === true, 'dev-mode override + full config => live');

  section('vessel.getContext()');
  let host = plugin('p-full', ['vessel.context', 'inbox.read', 'inbox.manage']);
  let ctx = host.vessel.getContext();
  ok(ctx.ok && ctx.vessel_imo === IMO && ctx.vessel_name === 'MV Harness' && ctx.configured === true && ctx.live === true, 'returns imo/name + configured/live');
  noLeak(ctx, 'vessel.getContext');
  let ctxDenied = plugin('p-none', []).vessel.getContext();
  ok(ctxDenied.ok === false && ctxDenied.state === 'permission_denied', 'permission_denied without vessel.context');

  section('inbox.list() — forces imo, injects bearer internally, no leak');
  fetchCalls = [];
  nextResponse = () => mkResponse({ body: { items: [{ id: 'r1', imo: 9999999, thumbnail_url: '/media/reports/r1/a.jpg' }], total: 1, limit: 50, offset: 0 } });
  let res = await host.inbox.list({ status: 'submitted', q: 'paint', limit: 10 });
  ok(res.ok && res.state === 'ok' && res.items.length === 1, 'returns items on 200');
  const call = fetchCalls[fetchCalls.length - 1];
  ok(call.url.includes('imo=' + IMO), 'request URL forces imo=' + IMO);
  ok(call.url.includes('status=submitted') && call.url.includes('q=paint') && call.url.includes('limit=10'), 'passes through status/q/limit');
  ok(call.opt.headers.Authorization === 'Bearer ' + TOKEN, 'bearer injected by HOST (not by plugin)');
  noLeak(res, 'inbox.list');
  ok(res.items[0].thumbnail_url === API + '/media/reports/r1/a.jpg', 'thumbnail_url absolutized to api_base/media');

  section('inbox.list() — plugin cannot override the vessel');
  fetchCalls = [];
  await host.inbox.list({ imo: 1234567, vessel_imo: 1234567 });
  ok(fetchCalls[0].url.includes('imo=' + IMO) && !fetchCalls[0].url.includes('1234567'), 'plugin-supplied imo ignored; forced imo wins');

  section('inbox.list() — honest states');
  // empty
  nextResponse = () => mkResponse({ body: { items: [], total: 0 } });
  ok((await host.inbox.list()).state === 'empty', 'empty inbox => state empty');
  // unauthorized
  nextResponse = () => mkResponse({ status: 403, body: 'forbidden' });
  let unauth = await host.inbox.list();
  ok(unauth.ok === false && unauth.state === 'unauthorized', '403 => unauthorized');
  noLeak(unauth, 'unauthorized');
  // backend unavailable (network throw)
  nextResponse = () => { throw new Error('ECONNREFUSED'); };
  ok((await host.inbox.list()).state === 'unavailable', 'fetch throw => unavailable');
  // no_config (config cleared but backend still "on")
  store.clear(); localStorage.setItem('skipi-onboard-dev', '1'); localStorage.setItem('skipi-onboard-crew-live', '1');
  ok((await host.inbox.list()).state === 'no_config', 'missing config => no_config');
  // backend_off (dev override off, flag off)
  store.clear();
  M.saveCrewConfig({ api_base: API, onboard_token: TOKEN, vessel_imo: IMO });
  ok((await host.inbox.list()).state === 'backend_off', 'no override + flag off => backend_off');
  // permission denied
  configLive();
  ok((await plugin('p-noread', ['vessel.context']).inbox.list()).state === 'permission_denied', 'no inbox.read => permission_denied');

  section('inbox.get() — vessel mismatch defense in depth');
  host = plugin('p-full', ['vessel.context', 'inbox.read', 'inbox.manage']);
  nextResponse = () => mkResponse({ body: { id: 'rX', imo: 1234567, photos: [{ storage_url: '/media/reports/rX/p.jpg' }] } });
  let mism = await host.inbox.get('rX');
  ok(mism.ok === false && mism.state === 'forbidden_vessel', 'report for another vessel => forbidden_vessel');
  nextResponse = () => mkResponse({ body: { id: 'rOK', imo: 9999999, photos: [{ storage_url: '/media/reports/rOK/p.jpg' }] } });
  let got = await host.inbox.get('rOK');
  ok(got.ok && got.report.photos[0].storage_url === API + '/media/reports/rOK/p.jpg', 'matching vessel => ok + absolutized photo');
  noLeak(got, 'inbox.get');
  nextResponse = () => mkResponse({ status: 404, body: 'nope' });
  ok((await host.inbox.get('missing')).state === 'not_found', '404 => not_found');
  ok((await host.inbox.get()).state === 'bad_request', 'missing id => bad_request');

  section('inbox.setStatus() — forward-only, host-mediated PATCH');
  ok(M.INBOX_FORWARD_STATUSES.join(',') === 'received,reviewed,archived', 'allowed statuses are received/reviewed/archived');
  ok((await host.inbox.setStatus('r1', 'submitted')).state === 'bad_request', 'cannot revert to submitted');
  ok((await host.inbox.setStatus('r1', 'bogus')).state === 'bad_request', 'rejects unknown status');
  fetchCalls = [];
  nextResponse = () => mkResponse({ body: { id: 'r1', status: 'reviewed' } });
  let st = await host.inbox.setStatus('r1', 'reviewed');
  ok(st.ok && st.report.status === 'reviewed', 'reviewed accepted');
  const pc = fetchCalls[fetchCalls.length - 1];
  ok(pc.opt.method === 'PATCH' && pc.url.endsWith('/api/reports/r1/status'), 'PATCH to /api/reports/{id}/status');
  ok(JSON.parse(pc.opt.body).status === 'reviewed' && pc.opt.headers.Authorization === 'Bearer ' + TOKEN, 'body {status} + host bearer');
  noLeak(st, 'inbox.setStatus');
  ok((await plugin('p-readonly', ['inbox.read']).inbox.setStatus('r1', 'reviewed')).state === 'permission_denied', 'read-only plugin cannot setStatus');

  section('inbox.photoUrl() — /media-only, token-free');
  host = plugin('p-full', ['vessel.context', 'inbox.read', 'inbox.manage']);
  ok(host.inbox.photoUrl({ storage_url: '/media/reports/r1/a.jpg' }) === API + '/media/reports/r1/a.jpg', 'media path => absolute url');
  ok(host.inbox.photoUrl('/api/reports/r1') === null, 'non-media (api) path => null (blocked)');
  ok(host.inbox.photoUrl('https://evil.example/x.jpg') === 'https://evil.example/x.jpg', 'absolute http passes through unchanged');
  ok(host.inbox.photoUrl(null) === null, 'null in => null out');
  ok(plugin('p-noread2', []).inbox.photoUrl({ storage_url: '/media/x.jpg' }) === null, 'no inbox.read => photoUrl null');
  ok(!String(host.inbox.photoUrl({ storage_url: '/media/reports/r1/a.jpg' })).includes(TOKEN), 'photo url carries no token');

  section('token confinement — never reachable through the host API surface');
  host = plugin('p-full', ['vessel.context', 'inbox.read', 'inbox.manage']);
  const surface = JSON.stringify(Object.keys(host)) + JSON.stringify(Object.keys(host.inbox)) + JSON.stringify(Object.keys(host.vessel));
  ok(!surface.includes('token') && !surface.includes('Authorization'), 'no token/auth accessor exposed on host API');
  ok(host.storage.get('skipi-onboard-crew-config') === null, "plugin storage is namespaced — cannot read host crew config key");

  console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
