// Headless harness for the On Board ISOLATED plugin runtime (SkipiOnboardPluginRuntime).
//
// Loads the REAL inline <script> from dist/index.html, captures the runtime's
// message handler + the iframe it creates, and asserts the isolation contract:
//   - frame is sandbox="allow-scripts" with NO allow-same-origin (opaque origin);
//   - frame srcdoc carries a strict CSP (default-src 'none'; connect-src 'none'; img-src data:);
//   - a per-mount capability token gates every bridge message (wrong token ignored);
//   - bridge dispatch is whitelisted; unknown namespaces are denied;
//   - host API works through the bridge (storage round-trip via makeHostApi);
//   - the secret onboard_token NEVER appears in any message sent to the frame;
//   - the loader no longer injects plugin code into the host document.
//
//   node tests/plugin_isolation_harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block'); process.exit(1); }

// ---- stubs ----
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
const noop = () => {};
const framePosts = [];
function makeIframe() {
  return { _tag: 'iframe', attrs: {}, style: {}, srcdoc: '', parentNode: null,
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    contentWindow: { postMessage: (m) => framePosts.push(m) }, appendChild: noop, remove: noop };
}
const genEl = () => ({ innerHTML: '', textContent: '', style: {}, classList: { add: noop, remove: noop, toggle: noop }, setAttribute: noop, getAttribute: () => null, appendChild: noop, remove: noop });
globalThis.document = {
  getElementById: () => genEl(), querySelector: () => genEl(), querySelectorAll: () => [],
  createElement: (t) => (t === 'iframe' ? makeIframe() : genEl()),
  head: genEl(), body: genEl(), documentElement: { getAttribute: () => 'light', setAttribute: noop },
};
globalThis.window = globalThis;
globalThis.__ONBOARD_NO_BOOT__ = true;
globalThis.fetch = async () => ({ status: 599, ok: false, async json() { return {}; }, async text() { return ''; } });
// capture the runtime's window 'message' handler so we can drive the bridge
const msgHandlers = [];
globalThis.addEventListener = (type, fn) => { if (type === 'message') msgHandlers.push(fn); };
const emit = (data, source) => msgHandlers.forEach((fn) => { try { fn({ data, source }); } catch (e) {} });
const tick = () => new Promise((r) => setTimeout(r, 0));

const EXPORTS = ['onboardPluginRuntime', 'makeHostApi', 'SkipiPlugins', 'saveCrewConfig'];
let M;
try { M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')(); }
catch (e) { console.error('load failed:', e); process.exit(1); }
for (const n of EXPORTS) if (M[n] === undefined) { console.error('missing symbol:', n); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log('\n# ' + t);

const TOKEN = 'SECRET-ONBOARD-BEARER-DO-NOT-LEAK';
// a secret onboard_token sits in host localStorage — it must never reach the frame
store.set('skipi-onboard-crew-config', JSON.stringify({ api_base: 'https://api.example.test', onboard_token: TOKEN, vessel_imo: '9234567', vessel_name: 'MV Iso' }));

section('static source — no host-side plugin execution, strict frame');
ok(!script.includes('data-plugin-js'), 'loader no longer injects plugin <script> into the host document');
ok(script.includes("SkipiPlugins[id] = { manifest: mani }") || script.includes('manifest: mani'), 'host registry manifest comes from verified plugin.json');
ok(script.includes("setAttribute('sandbox','allow-scripts')") && !/'allow-scripts allow-same-origin'|"allow-scripts allow-same-origin"/.test(script), 'iframe sandbox is allow-scripts only (no allow-same-origin granted)');
ok(/connect-src 'none'/.test(script) && /default-src 'none'/.test(script), "frame CSP forbids network (connect-src 'none') + default-src 'none'");

section('open() builds an isolated frame');
const hostApi = M.makeHostApi('iso-plugin');           // no manifest perms -> nothing granted
const mountEl = { innerHTML: '', _child: null, appendChild(c) { this._child = c; c.parentNode = this; }, removeChild(c) { if (this._child === c) this._child = null; } };
const bytes = { css: '.x{color:red}', js: 'window.SkipiPlugins=window.SkipiPlugins||{};window.SkipiPlugins["iso-plugin"]={mount:function(){},unmount:function(){}};' };
const opened = M.onboardPluginRuntime.open('iso-plugin', mountEl, hostApi, bytes);
const ifr = mountEl._child;
ok(ifr && ifr._tag === 'iframe', 'an iframe was mounted');
ok(ifr.attrs.sandbox === 'allow-scripts', 'sandbox="allow-scripts"');
ok(!/allow-same-origin/.test(ifr.attrs.sandbox || ''), 'NO allow-same-origin (opaque cross-origin)');
ok(/default-src 'none'/.test(ifr.srcdoc) && /connect-src 'none'/.test(ifr.srcdoc) && /img-src data:/.test(ifr.srcdoc), 'frame srcdoc carries the strict CSP');
ok(/__SKIPI_TOKEN__=/.test(ifr.srcdoc), 'frame boots with a per-mount capability token');
ok(!ifr.srcdoc.includes(TOKEN), 'secret onboard_token is NOT in the frame srcdoc');
const tokMatch = ifr.srcdoc.match(/__SKIPI_TOKEN__=("[0-9a-f]+")/);
const token = tokMatch ? JSON.parse(tokMatch[1]) : null;
ok(!!token && token.length >= 16, 'capability token is random + non-trivial');

section('init handshake — verified bytes to frame, no secrets');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'ready' });
const init = framePosts.find((m) => m.type === 'init');
ok(!!init, 'host sends init on frame ready');
ok(init && init.js === bytes.js && init.css === bytes.css, 'init carries the verified css/js (run inside frame, not host)');
ok(init && !JSON.stringify(init).includes(TOKEN), 'init message contains NO onboard_token');

section('token gating — forged/missing token is ignored');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: 'WRONG-TOKEN', type: 'api.call', id: 91, ns: 'storage', method: 'get', args: ['count'] });
await tick();
ok(framePosts.length === 0, 'api.call with wrong token is dropped (no response)');

section('source gating — right token but foreign ev.source is ignored (defense-in-depth)');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'api.call', id: 92, ns: 'storage', method: 'get', args: ['count'] }, { not: 'the frame' });
await tick();
ok(framePosts.length === 0, 'api.call with right token but foreign ev.source is dropped');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'api.call', id: 93, ns: 'storage', method: 'get', args: ['count'] }, ifr.contentWindow);
await tick();
ok(framePosts.some((m) => m.id === 93), 'api.call with right token AND active-frame ev.source is processed');

section('whitelist — unknown namespace denied');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'api.call', id: 1, ns: 'evilNs', method: 'pwn', args: [] });
await tick();
const denied = framePosts.find((m) => m.id === 1);
ok(denied && denied.error === 'denied_namespace', 'unknown namespace -> denied_namespace');

section('host API works through the bridge — storage round-trip (host-side, namespaced)');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'api.call', id: 2, ns: 'storage', method: 'set', args: ['count', 7] });
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'api.call', id: 3, ns: 'storage', method: 'get', args: ['count'] });
await tick(); await tick();
const got = framePosts.find((m) => m.id === 3);
ok(got && got.value === 7, 'storage.set then storage.get returns 7 via the bridge');
ok(store.has('skipi-plugin:iso-plugin:count'), 'value persisted in HOST-side namespaced storage (frame has none)');

section('permission enforcement still applies through the bridge');
framePosts.length = 0;
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'api.call', id: 4, ns: 'inbox', method: 'list', args: [{}] });
await tick(); await tick();
const inboxRes = framePosts.find((m) => m.id === 4);
ok(inboxRes && inboxRes.value && inboxRes.value.state === 'permission_denied', 'inbox.list denied without inbox.read permission');

section('no secret token leaks to the frame across the whole session');
ok(!framePosts.some((m) => JSON.stringify(m).includes(TOKEN)), 'no frame message ever contained the onboard_token');

section('mount + teardown');
emit({ ch: 'skipi-plugin', v: 1, token: token, type: 'mounted', height: 240, selfcheck: { parentDomAccess: false, storageBlocked: true, fetchBlocked: true } });
const res = await opened;
ok(res && res.ok, 'open() resolves ok after frame reports mounted');
const act = M.onboardPluginRuntime._active();
ok(act && act.selfcheck && act.selfcheck.parentDomAccess === false && act.selfcheck.storageBlocked === true, 'host records frame self-check (no parent DOM, storage blocked)');
M.onboardPluginRuntime.close();
ok(M.onboardPluginRuntime._active() === null, 'close() tears down the active frame');

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
