// Static harness for the bundled Transmed Marine Operations plugin.
//
// Verifies that On Board can see the bundle, checksums match the shipped bytes,
// dual-role manifest capabilities are treated as permissions, and makeHostApi
// exposes the onboard/vessel host identity the plugin needs to select its role.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const PLUGIN_DIR = path.join(ROOT, 'dist', 'plugins', 'transmed-marine-operations');

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
    if (typeof p === 'string' && /^(getAttribute|setAttribute|removeAttribute|addEventListener|removeEventListener|appendChild|removeChild|remove|focus|blur|click|querySelector|querySelectorAll)$/.test(p)) return noop;
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
globalThis.fetch = async () => ({ status: 599, ok: false, async json() { return {}; }, async text() { return ''; } });

const EXPORTS = ['BUNDLED_PLUGIN_DIRS', 'SkipiPlugins', 'manifestPermissions', 'pluginHasPerm', 'makeHostApi', 'saveCrewConfig'];
let M;
try {
  M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')();
} catch (e) {
  console.error('failed to load dist/index.html script:', e);
  process.exit(1);
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }
function sha256(name) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(PLUGIN_DIR, name))).digest('hex');
}

const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8'));
const checksums = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'checksums.json'), 'utf8'));
M.SkipiPlugins['transmed-marine-operations'] = { manifest };

ok(M.BUNDLED_PLUGIN_DIRS['transmed-marine-operations'] === './plugins/transmed-marine-operations', 'bundle registered in BUNDLED_PLUGIN_DIRS');
ok(checksums['plugin.json'] === sha256('plugin.json'), 'plugin.json checksum matches');
ok(checksums['index.js'] === sha256('index.js'), 'index.js checksum matches');
ok(checksums['index.css'] === sha256('index.css'), 'index.css checksum matches');

const perms = M.manifestPermissions(manifest);
ok(perms.includes('operations.items.read_own_vessel'), 'onboard role capability is treated as permission');
ok(perms.includes('operations.items.update_own_vessel'), 'update own-vessel permission present');
ok(!perms.includes('operations.items.close'), 'management-only close not granted onboard');
ok(M.pluginHasPerm('transmed-marine-operations', 'operations.items.read_own_vessel') === true, 'pluginHasPerm reads dual-role capabilities');
ok(M.pluginHasPerm('transmed-marine-operations', 'operations.items.close') === false, 'pluginHasPerm denies management-only capability onboard');

M.saveCrewConfig({ api_base: 'https://api.example.test', onboard_token: 'SECRET', vessel_imo: '9001001', vessel_name: 'MV Harness' });
const host = M.makeHostApi('transmed-marine-operations');
ok(host.host && host.host.id === 'onboard', 'makeHostApi exposes host.id onboard');
ok(host.role === 'vessel', 'makeHostApi exposes role vessel');
ok(host.vessel.getContext().vessel_name === 'MV Harness', 'vessel context still available');
ok(typeof host.operations.listOwn === 'function' && typeof host.operations.createOwn === 'function', 'operations bridge methods exposed');

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
