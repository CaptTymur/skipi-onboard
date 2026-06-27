// Headless harness for the On Board shared Settings Standard inheritance.
//
// Loads the REAL inline <script> from dist/index.html and verifies:
// - desktop Settings Restyle chrome is present (two-panel sidebar/body);
// - On Board IA includes the shared "Сопряжённые устройства" section;
// - device-pairing section is honest shell only: no fake paired devices,
//   no backend calls, disabled QR/revoke controls;
// - product-specific On Board sections remain present.
//
//   node tests/settings_standard_harness.mjs

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
  querySelector: () => elFor('_q'),
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
  return { status: 599, ok: false, async json() { return {}; }, async text() { return ''; } };
};

const EXPORTS = ['settingsState', 'renderSettings', 'settingsSetTab', 'renderPairedDevicesSettings', 'crewConfig', 'saveCrewConfig'];
let M;
try { M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')(); }
catch (e) { console.error('load failed:', e); process.exit(1); }
for (const n of EXPORTS) if (M[n] === undefined) { console.error('missing symbol:', n); process.exit(1); }

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
};
const section = (title) => console.log('\n# ' + title);

section('static — shared desktop settings chrome');
ok(HTML.includes('#004564'), 'shared accent #004564 present');
ok(HTML.includes('grid-template-columns:286px minmax(0,1fr)'), 'desktop two-panel modal grid');
ok(HTML.includes('.settings-sidebar-head') && HTML.includes('.settings-traffic'), 'sidebar head + traffic dots present');
ok(HTML.includes('.settings-nav-list'), 'settings nav list style present');

section('navigation IA — On Board inherits shared settings structure');
M.renderSettings();
let nav = els.get('settings-nav').innerHTML;
ok(nav.includes('<h2>Настройки</h2>'), 'sidebar title is Настройки');
ok(nav.includes('Skipi On Board · судовое рабочее пространство'), 'sidebar product summary');
[
  'onboard-settings-vessel',
  'onboard-settings-crew',
  'onboard-settings-devices',
  'onboard-settings-connection',
  'onboard-settings-workflow',
  'onboard-settings-security',
  'onboard-settings-about',
].forEach((hook) => ok(nav.includes('data-qa="' + hook + '"'), 'nav hook ' + hook));
ok(nav.includes('Сопряжённые устройства'), 'shared paired-devices section is visible');
ok(nav.includes('Приложение'), 'About renamed to shared application section');

section('paired devices tab — honest shell, no backend calls');
fetchCalls = [];
M.settingsSetTab('devices');
let body = els.get('settings-body').innerHTML;
ok(body.includes('id="settings-title">Сопряжённые устройства'), 'devices title rendered');
ok(body.includes('data-qa="onboard-settings-devices-panel"'), 'devices panel hook');
ok(body.includes('data-qa="paired-devices-empty"'), 'empty paired devices hook');
ok(body.includes('not connected'), 'explicit not-connected state');
ok(body.includes('disabled>Недоступно</button>') && body.includes('disabled>Нет устройств</button>'), 'QR/revoke controls disabled');
ok(body.includes('не показывает фейковые пары'), 'no fake paired devices copy');
ok(fetchCalls.length === 0, 'rendering devices tab makes no network calls');

section('product sections remain intact');
M.settingsSetTab('vessel');
ok(els.get('settings-body').innerHTML.includes('Моё судно'), 'My Vessel settings kept');
M.settingsSetTab('crew');
ok(els.get('settings-body').innerHTML.includes('Экипаж'), 'Crew settings kept');
M.settingsSetTab('security');
ok(els.get('settings-body').innerHTML.includes('Экипаж — это <b>НЕ</b> device pairing'), 'crew/device boundary kept');

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
