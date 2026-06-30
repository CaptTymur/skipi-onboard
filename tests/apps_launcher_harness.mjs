// Headless harness for the Apps Compact Plugin Launcher v2.
//
// Loads the REAL inline <script> from dist/index.html, stubs the browser globals,
// and exercises the launcher surface + manage view + states. Asserts: QA hooks
// present (apps-search-input, plugins-settings-open, plugin-tile-<id>,
// plugin-open-<id>, plugin-empty-state/offline-state/error-state, nav module
// hooks), installed-only icon tiles, search filtering, gear -> manage view,
// and that the launcher is the default primary Apps surface.
//
//   node tests/apps_launcher_harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block'); process.exit(1); }

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
const noop = () => {};
const els = new Map();
function elFor(id) {
  if (!els.has(id)) els.set(id, { innerHTML: '', textContent: '', value: '', style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, getAttribute: () => null, addEventListener: noop, appendChild: noop, remove: noop, focus: noop });
  return els.get(id);
}
globalThis.document = { getElementById: (id) => elFor(id), querySelector: () => elFor('_q'), querySelectorAll: () => [], createElement: () => elFor('_c'), head: elFor('_head'), body: elFor('_body'), documentElement: { getAttribute: () => 'light', setAttribute: noop } };
globalThis.window = globalThis;
globalThis.__ONBOARD_NO_BOOT__ = true;
globalThis.fetch = async () => ({ status: 599, ok: false, async json() { return {}; }, async text() { return ''; } });

const EXPORTS = ['appsState', 'appsLauncherHtml', 'appsLauncherBodyHtml', 'appsFilter', 'appsSetView', 'installedPluginIds', 'appsShortLabel', 'appsListHtml', 'renderApps', 'catalogPluginIds', 'SkipiPlugins', 'BUNDLED_PLUGIN_DIRS', 'pluginIntegrity'];
let M;
try { M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')(); }
catch (e) { console.error('load failed:', e); process.exit(1); }
for (const n of EXPORTS) if (M[n] === undefined) { console.error('missing symbol:', n); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log('\n# ' + t);

// register a real-looking installed plugin (presentation only; no runtime)
const PID = 'photo-reporter';
M.SkipiPlugins[PID] = { manifest: { name: 'Photo Reporter', short_name: 'Photo Reporter', tagline: 'photo reports', icon: '📷' }, mount: noop, unmount: noop };
M.BUNDLED_PLUGIN_DIRS[PID] = './plugins/photo-reporter';
const installed = () => store.set('skipi-onboard-plugins', JSON.stringify({ [PID]: { installed: true, enabled: true } }));
const uninstalled = () => store.set('skipi-onboard-plugins', JSON.stringify({ [PID]: { installed: false, enabled: false } }));

(section('static — accent + launcher styles + nav hooks in dist'));
ok(HTML.includes('#004564'), 'accent #004564 present');
ok(HTML.includes('.apps-launch-tile') && HTML.includes('.apps-launch-grid'), 'compact launcher CSS present');
['onboard-module-crew', 'onboard-module-apps', 'onboard-module-vdocs'].forEach((h) => ok(HTML.includes('data-qa="' + h + '"'), 'nav hook ' + h));
ok(HTML.includes('data-mod="crew"') && HTML.includes('data-mod="apps"') && HTML.includes('data-mod="vdocs"'), 'top tabs Crew/Apps/Vessel Documents preserved');

section('launcher chrome — search + gear hooks, default surface');
ok(M.appsState.view === 'launcher', 'default Apps surface is the launcher');
M.appsState.q = '';
let lh = M.appsLauncherHtml();
ok(lh.includes('data-qa="apps-search-input"'), 'apps-search-input hook');
ok(lh.includes('oninput="appsFilter(this.value)"'), 'search filters live');
ok(lh.includes('data-qa="plugins-settings-open"'), 'plugins-settings-open gear hook');
ok(/Найти плагин/.test(lh), 'search placeholder present');

section('empty state — no installed plugins');
uninstalled();
let body = M.appsLauncherBodyHtml();
ok(body.includes('data-qa="plugin-empty-state"'), 'plugin-empty-state hook');
ok(body.includes('Нет установленных плагинов'), 'honest empty copy');
ok(body.includes("appsSetView('manage')"), 'empty state CTA opens plugin settings');
ok(!/marketplace|coming soon/i.test(body), 'no marketplace/long cards on launcher');

section('installed plugin — compact icon tile');
installed();
ok(M.installedPluginIds().indexOf(PID) >= 0, 'installedPluginIds includes enabled plugin');
body = M.appsLauncherBodyHtml();
ok(body.includes('data-qa="plugin-tile-' + PID + '"'), 'plugin-tile-<id> hook');
ok(body.includes('data-qa="plugin-open-' + PID + '"'), 'plugin-open-<id> hook');
ok(body.includes('Photo Reporter'), 'short label shown');
ok(body.includes('Установленные плагины'), 'installed-plugins section title');
ok(body.includes("pluginOpen('" + PID + "')"), 'tile opens via pluginOpen (runtime untouched)');

section('search — installed-only filtering');
M.appsFilter('photo');
ok(els.get('apps-launch-body').innerHTML.includes('plugin-tile-' + PID), 'matching query keeps the tile');
M.appsFilter('zzzz');
let fb = els.get('apps-launch-body').innerHTML;
ok(fb.includes('data-qa="plugin-empty-state"') && fb.includes('Ничего не найдено'), 'no-results uses empty-state, scoped to installed');
M.appsFilter('');

section('gear -> manage view (catalog + states live here, not launcher)');
M.appsSetView('manage');
ok(M.appsState.view === 'manage', 'view switched to manage');
let mhtml = els.get('scr-content').innerHTML;
ok(mhtml.includes('← Plugins'), 'manage view has back-to-launcher');
ok(mhtml.includes('Plugin settings') || mhtml.includes('Каталог'), 'manage view is the catalog/settings');
ok(mhtml.includes('data-qa="plugin-settings-' + PID + '"'), 'manage tile has plugin-settings-<id> hook');
M.appsSetView('launcher');
ok(M.appsState.view === 'launcher' && els.get('scr-content').innerHTML.includes('apps-search-input'), 'back to launcher surface');

section('error state — integrity failure surfaced honestly');
M.pluginIntegrity[PID] = { ok: false, reason: 'checksum mismatch' };
ok(M.appsLauncherBodyHtml().includes('data-qa="plugin-error-state"'), 'plugin-error-state hook on integrity failure');
delete M.pluginIntegrity[PID];

section('offline state — real navigator.onLine (skipped if not settable in this runtime)');
let offlineTested = false;
try {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  if (globalThis.navigator && globalThis.navigator.onLine === false) {
    offlineTested = true;
    ok(M.appsLauncherBodyHtml().includes('data-qa="plugin-offline-state"'), 'plugin-offline-state when offline');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
    ok(!M.appsLauncherBodyHtml().includes('data-qa="plugin-offline-state"'), 'no offline-state when online');
  }
} catch (e) { /* navigator not settable here */ }
if (!offlineTested) console.log('  ~ offline-state branch present in source: ' + (script.includes('plugin-offline-state') ? 'yes (runtime cannot toggle navigator)' : 'NO'));
ok(script.includes('plugin-offline-state'), 'plugin-offline-state hook reserved in source');

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
