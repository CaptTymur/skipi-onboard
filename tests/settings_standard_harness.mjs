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

// ---------------------------------------------------------------------------
// Unified @skipi/settings shell adoption — targeted failing-first checks for
// the wave 5×2 phase-2 fixes:
//   fix 1: mount mode 'auto' + breakpoint 720 (responsive mobile, not a
//          hardcoded desktop layout);
//   fix 2: real persisted install-ID (the 'onboard-local' placeholder is
//          FORBIDDEN) + profile email from real persistent settings;
//   fix 3: host.getAccountSummary present (mobile header renders real data);
//   fix 4: Android system Back closes the overlay via a history marker
//          (pushState on open / popstate close / consume on other closes);
//   guard: light theme stays the default on a fresh install.
// ---------------------------------------------------------------------------

function statefulEl(id) {
  const classes = new Set();
  const el = {
    innerHTML: '', textContent: '', value: '', style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute: noop, getAttribute: () => null, addEventListener: noop,
    appendChild: noop, remove: noop, focus: noop,
  };
  els.set(id, el);
  return el;
}
const uOverlay = statefulEl('unified-settings-overlay');
statefulEl('settings-root');

const winListeners = new Map();
globalThis.addEventListener = (type, fn) => {
  if (!winListeners.has(type)) winListeners.set(type, []);
  winListeners.get(type).push(fn);
};
globalThis.removeEventListener = noop;
const historyCalls = [];
globalThis.history = {
  pushState: (state) => historyCalls.push({ kind: 'push', state }),
  back: () => historyCalls.push({ kind: 'back' }),
};

const mountCalls = [];
globalThis.SkipiSettings = {
  mount: (root, host, options) => {
    mountCalls.push({ root, host, options });
    return { unmount: noop, ready: Promise.resolve() };
  },
};

const HOST_SRC = fs.readFileSync(path.join(__dirname, '..', 'dist', 'skipi-onboard-settings-host.js'), 'utf8');
try { new Function(HOST_SRC)(); }
catch (e) { console.error('host adapter load failed:', e); process.exit(1); }
const U = globalThis.OnboardUnifiedSettings;
if (!U) { console.error('window.OnboardUnifiedSettings missing'); process.exit(1); }

store.clear(); // fresh-install state for the unified-shell checks

section('unified shell — light theme default preserved (fresh install)');
{
  const h = U._host();
  ok(h.getSettings().appearance.theme === 'light', "fresh getSettings().appearance.theme is 'light'");
}

section('unified shell — fix 1: responsive mount (mode auto, not hardcoded desktop)');
{
  ok(U.open() === true, 'open() mounts the vendored shell');
  const opt = (mountCalls[0] || {}).options || {};
  ok(opt.mode === 'auto', "mount options.mode is 'auto' (got " + JSON.stringify(opt.mode) + ')');
  ok(opt.breakpoint === 720, 'mount options.breakpoint is 720 (got ' + JSON.stringify(opt.breakpoint) + ')');
}

section('unified shell — fix 2: real install identity, no placeholder id');
{
  const p1 = U._host().getProfile();
  ok(p1 && p1.user && typeof p1.user.id === 'string' && p1.user.id.length > 0, 'getProfile().user.id present');
  ok(p1.user.id !== 'onboard-local', "user.id is NOT the forbidden 'onboard-local' placeholder");
  const p2 = U._host().getProfile();
  ok(p2.user.id === p1.user.id, 'user.id stable across host rebuilds');
  ok(store.get('skipi-onboard-install-id') === p1.user.id, 'install-ID persisted in home settings storage');
  ok(!p1.user.email, 'no fake default email on fresh install');
}

section('unified shell — fix 2: profile email from real persistent settings (editable)');
{
  const h = U._host();
  const s = h.getSettings();
  s.profile = { email: 'master@vessel.example' };
  h.saveSettings(s);
  ok(U._host().getProfile().user.email === 'master@vessel.example', 'saved profile.email surfaces in getProfile().user.email');
  const appSections = U._host().appSpecificSections || [];
  const acct = appSections.find((x) => x && x.handlers && typeof x.handlers['onboard-account-save'] === 'function');
  ok(!!acct, 'app-specific account section provides an email save handler');
  if (acct) {
    const htmlOut = acct.renderHtml({ escapeHtml: (v) => String(v), escapeAttr: (v) => String(v), t: (k) => k });
    ok(htmlOut.includes('onboard-account-email'), 'account section renders the email input');
    ok(htmlOut.includes('master@vessel.example'), 'email input pre-filled from persistent settings');
    elFor('onboard-account-email').value = ' captain@vessel.example ';
    let savedNext = null;
    acct.handlers['onboard-account-save']({ saveSettings: (next) => { savedNext = next; return Promise.resolve(next); } });
    ok(savedNext && savedNext.profile && savedNext.profile.email === 'captain@vessel.example',
      'save handler persists the trimmed email into settings.profile.email via ctx.saveSettings');
  }
}

section('unified shell — fix 3: getAccountSummary present (mobile header)');
{
  const h = U._host();
  ok(typeof h.getAccountSummary === 'function', 'host.getAccountSummary is a function');
  if (typeof h.getAccountSummary === 'function') {
    store.set('skipi-onboard-crew-config', JSON.stringify({ vessel_name: 'MV Test Vessel', vessel_imo: '9876543' }));
    const sum = U._host().getAccountSummary();
    ok(sum && typeof sum.displayName === 'string' && sum.displayName.includes('MV Test Vessel'),
      'displayName sourced from the real crew-config vessel');
    ok(sum.subtitle === 'master@vessel.example', 'subtitle is the real saved profile email');
    ok(sum.sectionId === 'profile', 'summary links to the profile section');
  }
}

section('unified shell — fix 4: Android Back closes the overlay via history marker');
{
  U.close();
  historyCalls.length = 0;
  ok(U.open() === true, 'reopen for the Back test');
  const pushes = historyCalls.filter((c) => c.kind === 'push');
  ok(pushes.length === 1 && pushes[0].state && pushes[0].state.skipiUnifiedSettings === true,
    'open() pushes exactly ONE skipiUnifiedSettings history marker');
  ok(uOverlay.classList.contains('open'), 'overlay is open before system Back');
  // System Back: the browser pops our marker entry -> popstate fires.
  historyCalls.length = 0;
  (winListeners.get('popstate') || []).forEach((fn) => fn({}));
  ok(!uOverlay.classList.contains('open'), 'popstate (system Back) closes the unified overlay');
  ok(historyCalls.filter((c) => c.kind === 'back').length === 0, 'popstate path does NOT call history.back() (no double-consume)');
  // Any other close path consumes the marker exactly once.
  historyCalls.length = 0;
  ok(U.open() === true, 'reopen for the close-consume test');
  U.close();
  ok(historyCalls.filter((c) => c.kind === 'back').length === 1, 'close() consumes the marker via exactly one history.back()');
  // A foreign popstate (marker already consumed) must be left alone.
  historyCalls.length = 0;
  (winListeners.get('popstate') || []).forEach((fn) => fn({}));
  ok(historyCalls.length === 0 && !uOverlay.classList.contains('open'), 'foreign popstate is ignored (no marker)');
}

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
