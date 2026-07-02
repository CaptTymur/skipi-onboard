// Headless harness for the Apps Compact Plugin Launcher v2 + the Vessel
// Documents v0 vault surface.
//
// Loads the REAL inline <script> from dist/index.html, stubs the browser globals,
// and exercises the launcher surface + manage view + states. Asserts: QA hooks
// present (apps-search-input, plugins-settings-open, plugin-tile-<id>,
// plugin-open-<id>, plugin-empty-state/offline-state/error-state, nav module
// hooks), installed-only icon tiles, search filtering, gear -> manage view,
// and that the launcher is the default primary Apps surface.
//
// Vessel Documents v0 (Docs Module Standard v1, On Board adapter): static
// no-network boundary check, docs-* QA hooks, classify thresholds 30/90,
// create/attach/filter/search flows, required-delete guard, fail-closed vault
// read, demo-fixture scoping.
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

const EXPORTS = ['appsState', 'appsLauncherHtml', 'appsLauncherBodyHtml', 'appsFilter', 'appsSetView', 'installedPluginIds', 'appsShortLabel', 'appsListHtml', 'renderApps', 'catalogPluginIds', 'SkipiPlugins', 'BUNDLED_PLUGIN_DIRS', 'pluginIntegrity',
  'vdocsState', 'renderVesselDocs', 'vdocsDocs', 'vdocsOpenAdd', 'vdocsCreate', 'vdocsSelect', 'vdocsSetFilter', 'vdocsSearch', 'vdocsField', 'vdocsApplyFileMeta', 'vdocsDelete', 'vdocsFilterCounts', 'vdocStatus', 'vdocValidity', 'VDOC_CATEGORIES',
  'makeHostApi'];
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

// ===================== Vessel Documents v0 (vessel-owned local vault) =====================
globalThis.confirm = () => true;
const scr = () => els.get('scr-content').innerHTML;
// Local-date helper: vdocDaysLeft counts whole days from LOCAL midnight, so the
// fixture dates must be local too — a UTC-based toISOString() here shifts all
// boundary assertions by one day between local 00:00 and UTC midnight (review
// finding F2 of the vdocs v0 review, observed live on 2026-07-03).
const isoIn = (n) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const vdocsReset = () => {
  store.delete('skipi-onboard-vdocs'); store.delete('skipi-onboard-crew-config');
  M.vdocsState.selectedId = null; M.vdocsState.filter = 'all'; M.vdocsState.q = ''; M.vdocsState.addOpen = false; M.vdocsState.err = null;
};

section('vdocs — static no-network boundary + source hooks');
const vb0 = script.indexOf('VDOCS NO-NETWORK BOUNDARY START');
const vb1 = script.indexOf('VDOCS NO-NETWORK BOUNDARY END');
ok(vb0 >= 0 && vb1 > vb0, 'no-network boundary markers present');
const vregion = script.slice(vb0, vb1);
ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|crewFetch|vesselFetch|hostReportsFetch|crewApiUrl|inboxApiBase/.test(vregion),
  'no network primitives or HTTP helpers inside the vdocs module');
['docs-tree', 'docs-search', 'docs-detail', 'docs-status-badge', 'docs-add', 'docs-add-overlay', 'docs-attach',
  'docs-drop-zone', 'docs-preview', 'docs-replace', 'docs-empty', 'docs-error', 'docs-dashboard', 'docs-offline',
  'docs-field-permanent', 'docs-field-title', 'docs-field-category', 'docs-field-kind', 'docs-field-notes', 'docs-autosave']
  .forEach((h) => ok(vregion.includes('data-qa="' + h + '"'), 'source hook ' + h));
ok(vregion.includes('data-qa="docs-filter-'), 'docs-filter-<id> hook generator');
ok(vregion.includes('data-qa="docs-category-'), 'docs-category-<slug> hook generator');
ok(vregion.includes('data-qa="docs-item-'), 'docs-item-<docId> hook generator');
ok(vregion.includes('data-qa="docs-field-'), 'docs-field-<name> hook generator');

section('vdocs — classify thresholds (30/90) + presence-derived states');
const fdoc = (o) => Object.assign({ kind: 'custom', file: { file_name: 'x.pdf' }, is_permanent: false, valid_to: '' }, o);
ok(M.vdocStatus(fdoc({ valid_to: isoIn(-1) })) === 'expired', 'valid_to yesterday -> expired');
ok(M.vdocStatus(fdoc({ valid_to: isoIn(0) })) === 'expiring_critical', 'valid_to today -> expiring_critical');
ok(M.vdocStatus(fdoc({ valid_to: isoIn(29) })) === 'expiring_critical', '+29d -> expiring_critical');
ok(M.vdocStatus(fdoc({ valid_to: isoIn(30) })) === 'expiring_warning', '+30d -> expiring_warning');
ok(M.vdocStatus(fdoc({ valid_to: isoIn(89) })) === 'expiring_warning', '+89d -> expiring_warning');
ok(M.vdocStatus(fdoc({ valid_to: isoIn(90) })) === 'valid', '+90d -> valid');
ok(M.vdocStatus(fdoc({ is_permanent: true, valid_to: isoIn(5) })) === 'permanent', 'permanent wins over expiry');
ok(M.vdocStatus(fdoc({ valid_to: '' })) === 'no_expiry', 'no valid_to -> no_expiry');
ok(M.vdocStatus(fdoc({ file: null, kind: 'required' })) === 'missing', 'required without file -> missing');
ok(M.vdocStatus(fdoc({ file: null, kind: 'custom' })) === 'no_file', 'non-required without file -> no_file');

section('vdocs — first-run empty state + ownership copy');
vdocsReset();
M.renderVesselDocs();
let vh = scr();
ok(vh.includes('data-qa="docs-empty"'), 'first-run docs-empty state');
ok(/nothing leaves the vessel/i.test(vh), 'ownership copy: nothing leaves the vessel');
ok(/stored in this vessel vault/i.test(vh), 'ownership copy: stored in this vessel vault');
ok(vh.includes('data-qa="docs-add"'), 'docs-add CTA on empty state');
ok(!vh.includes('data-qa="docs-error"'), 'no error state on healthy empty vault');

section('vdocs — add overlay -> create -> tree/detail hooks');
M.vdocsOpenAdd();
ok(scr().includes('data-qa="docs-add-overlay"'), 'add overlay hook rendered');
elFor('docs-add-title').value = 'Test Certificate';
elFor('docs-add-cat').value = 'certificates';
elFor('docs-add-kind').value = 'required';
M.vdocsCreate();
let vdocs = M.vdocsDocs();
ok(vdocs.length === 1 && vdocs[0].title === 'Test Certificate', 'document created in the vault');
const did = vdocs[0].id;
ok(vdocs[0].kind === 'required' && vdocs[0].category === 'certificates', 'kind/category honored from the form');
ok(vdocs[0].provenance && vdocs[0].provenance.source === 'owner', 'provenance source=owner');
vh = scr();
ok(vh.includes('data-qa="docs-tree"'), 'docs-tree rendered');
M.VDOC_CATEGORIES.forEach((c) => ok(vh.includes('data-qa="docs-category-' + c.slug + '"'), 'category folder ' + c.slug));
ok(vh.includes('data-qa="docs-item-' + did + '"'), 'docs-item-<docId> row');
ok(vh.includes('data-qa="docs-detail"'), 'detail opens for the new document');
['doc_number', 'issued_by', 'valid_from', 'valid_to'].forEach((f) => ok(vh.includes('data-qa="docs-field-' + f + '"'), 'field hook ' + f));
ok(vh.includes('data-qa="docs-field-permanent"'), 'field hook permanent');
ok(vh.includes('data-qa="docs-status-badge"') && vh.includes('Missing'), 'required without file shows Missing badge');
ok(vh.includes('data-qa="docs-drop-zone"') && vh.includes('data-qa="docs-attach"'), 'attach + drop-zone offered before a file exists');
ok(vh.includes('data-qa="docs-autosave"'), 'autosave indicator present');

section('vdocs — filters with live counts + honest filter/search empty');
let counts = M.vdocsFilterCounts(M.vdocsDocs(), '');
ok(counts.all === 1 && counts.required === 1 && counts.missing === 1 && counts.uploaded === 0, 'live counts (all/required/missing/uploaded)');
M.vdocsSetFilter('uploaded');
vh = scr();
ok(vh.includes('data-qa="docs-empty"') && vh.includes('No documents match'), 'honest empty state for a filter with no matches');
M.vdocsSetFilter('missing');
ok(scr().includes('data-qa="docs-item-' + did + '"'), 'missing filter keeps the missing required doc');
M.vdocsSetFilter('all');
M.vdocsSearch('zzzz-no-match');
ok(els.get('docs-left-body').innerHTML.includes('data-qa="docs-empty"'), 'honest empty state for a search with no matches');
M.vdocsSearch('test cert');
ok(els.get('docs-left-body').innerHTML.includes('data-qa="docs-item-' + did + '"'), 'search finds by title');
M.vdocsSearch('');

section('vdocs — attach file metadata -> preview/replace + validity');
M.vdocsApplyFileMeta(did, { file_name: 'cert.pdf', file_size: 23456, content_type: 'application/pdf' });
vdocs = M.vdocsDocs();
ok(vdocs[0].file && vdocs[0].file.file_name === 'cert.pdf', 'file metadata stored in the vault record');
vh = scr();
ok(vh.includes('data-qa="docs-preview"') && vh.includes('cert.pdf'), 'preview card shows the file record');
ok(vh.includes('data-qa="docs-replace"'), 'replace action available');
ok(/file bytes are not copied yet/i.test(vh), 'honest metadata-only copy in the file card');
ok(M.vdocStatus(vdocs[0]) === 'no_expiry', 'attached without expiry -> no_expiry');
M.vdocsField(did, 'valid_to', isoIn(10));
ok(M.vdocStatus(M.vdocsDocs()[0]) === 'expiring_critical', 'expiry set via autosave field -> expiring_critical');
ok(scr().includes('Expiring soon'), 'badge label follows the 30-day threshold');
counts = M.vdocsFilterCounts(M.vdocsDocs(), '');
ok(counts.uploaded === 1 && counts.expiring === 1 && counts.missing === 0, 'counts follow attach + expiry');

section('vdocs — required delete guard, then delete as custom');
M.vdocsDelete(did);
ok(M.vdocsDocs().length === 1, 'required document cannot be deleted');
M.vdocsField(did, 'kind', 'custom');
M.vdocsDelete(did);
ok(M.vdocsDocs().length === 0, 'custom document deletes after confirm');

section('vdocs — fail-closed on corrupt vault record');
store.set('skipi-onboard-vdocs', '{corrupt');
M.renderVesselDocs();
vh = scr();
ok(vh.includes('data-qa="docs-error"'), 'corrupt vault -> docs-error state');
ok(!vh.includes('data-qa="docs-empty"'), 'corrupt vault is NOT shown as a healthy empty vault');
let threw = false;
try { M.vdocsField('nope', 'title', 'x'); } catch (e) { threw = true; }
ok(!threw, 'edits on a corrupt vault fail closed without throwing');
ok(store.get('skipi-onboard-vdocs') === '{corrupt', 'corrupt raw record preserved (never overwritten)');

section('vdocs — demo fixtures scoped to demo mode');
vdocsReset();
store.set('skipi-onboard-crew-config', JSON.stringify({ vessel_mode: 'demo' }));
M.renderVesselDocs();
ok(M.vdocsDocs().length >= 6, 'demo vessel seeds example documents');
ok(scr().includes('Demo data'), 'demo pill shown');
ok(M.vdocsDocs().every((d) => d.fixture === true), 'all seeded docs flagged fixture');
store.set('skipi-onboard-crew-config', '{}');
ok(M.vdocsDocs().length === 0, 'fixtures hidden outside demo mode (no leak to a real vessel)');
vdocsReset();

section('vdocs — offline pill (informational; vault works offline)');
let vOfflineTested = false;
try {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  if (globalThis.navigator && globalThis.navigator.onLine === false) {
    vOfflineTested = true;
    M.renderVesselDocs();
    ok(scr().includes('data-qa="docs-offline"'), 'offline pill shown when navigator is offline');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
    M.renderVesselDocs();
    ok(!scr().includes('data-qa="docs-offline"'), 'no offline pill when online');
  }
} catch (e) { /* navigator not settable here */ }
if (!vOfflineTested) ok(vregion.includes('data-qa="docs-offline"'), 'offline pill reserved in source (runtime cannot toggle navigator)');
vdocsReset();

// ===================== Fresh-install light theme (Homes Light Theme Sweep 2026-07-03) =====================
// On Board must first-launch LIGHT, never dark by default. Dark is NOT a
// supported user option in On Board today (no theme switcher, no dark palette),
// so there is no saved-dark preference to preserve — these checks pin the
// light-only invariants so a dark default cannot regress in silently.

section('theme — fresh install is light (static invariants)');
ok(HTML.includes('<html lang="en" data-theme="light">'), 'html root hardcodes data-theme="light"');
ok(HTML.includes(':root, [data-theme="light"]'), 'light palette is the :root default');
ok(!/\[data-theme="dark"\]/.test(HTML), 'no dark palette CSS block exists');
ok(!/prefers-color-scheme/i.test(HTML), 'no prefers-color-scheme anywhere — OS dark mode cannot influence the app');
ok(!/matchMedia/.test(script), 'no matchMedia usage — no runtime OS-theme detection');
ok(!/['"]dark['"]/.test(script), 'no "dark" string literal in JS — no dark fallback can exist');
ok(!/localStorage\.(getItem|setItem)\(\s*['"][^'"]*theme[^'"]*['"]/i.test(script), 'no theme persistence key — nothing can restore a dark state');

section('theme — plugin host bridge reports light on fresh launch');
ok(script.includes("getAttribute('data-theme') || 'light'"), 'host theme.get falls back to light');
ok(script.includes("var slug=null, theme='light'"), 'sandbox shim initial theme is light');
ok(script.includes("theme=m.theme||'light'"), 'sandbox shim init-message fallback is light');
ok(script.includes("theme:(api.theme&&api.theme.get&&api.theme.get())||'light'"), 'bridge sendInit falls back to light');

section('theme — runtime: fresh empty storage + simulated OS dark still light');
store.clear();
globalThis.matchMedia = () => ({ matches: true, media: '(prefers-color-scheme: dark)', addEventListener: noop, removeEventListener: noop });
const freshApi = M.makeHostApi('theme-probe');
ok(freshApi.theme.get() === 'light', 'theme bridge reports light with fresh storage (documentElement says light)');
const realGetAttr = globalThis.document.documentElement.getAttribute;
globalThis.document.documentElement.getAttribute = () => null;
ok(freshApi.theme.get() === 'light', 'theme bridge falls back to light even with no data-theme attribute at all');
globalThis.document.documentElement.getAttribute = realGetAttr;
ok(freshApi.theme.get() === 'light', 'simulated prefers-color-scheme:dark has no effect — still light');
delete globalThis.matchMedia;
store.clear();

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
