// Presence contract for Skipi On Board required modules.
//
// Closes the "module silently disappears from UI" regression class (Broker
// Counterparties/Deduplicator incident; On Board VDocs spot-check mutation M3):
// a required module tab hidden via display:none — inline OR stylesheet — or
// removed/renamed must turn this harness red.
//
// Three layers, driven by presence-manifest.json:
//   1. manifest integrity — the manifest itself cannot silently drop a module:
//      the canonical floor below is duplicated here on purpose; deleting a
//      module from the manifest alone fails the run;
//   2. static perimeter — nav element exists, carries no hiding inline
//      style/hidden/aria-hidden/hiding class, and no stylesheet rule targeting
//      the module (or the shared modules bar) hides it. Selectors scoped under
//      body.launching are the allowed pre-shell launch-screen exception;
//   3. runtime routes — loads the REAL inline <script> with the same stub
//      pattern as the other On Board harnesses, drives showModule(route) /
//      showSettings(), and asserts each module's surface markers render.
//
//   node tests/onboard_presence_contract_harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Canonical floor: required module ids that must ALWAYS be in the manifest.
// Removing a module from presence-manifest.json alone must fail here.
const REQUIRED_FLOOR = ['crew', 'apps', 'my-vessel', 'vessel-documents', 'settings'];
// Shared chrome tokens: a stylesheet rule hiding the whole modules bar hides
// every module, so these are scanned in addition to per-module css_tokens.
const GLOBAL_CSS_TOKENS = ['.mod-tab', '.mod-tabs', '.modules-bar'];
// Pre-shell launch screen legitimately hides the modules bar until the user
// enters the shell; only selectors scoped under body.launching are exempt.
const ALLOWED_HIDING_SCOPE = 'body.launching';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log('\n# ' + t);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'presence-manifest.json'), 'utf8'));
const HTML = fs.readFileSync(path.join(ROOT, manifest.artifact || 'dist/index.html'), 'utf8');

section('manifest integrity — required floor cannot be dropped');
ok(manifest.schema_version === 'skipi.presence-manifest.v1', 'schema_version is skipi.presence-manifest.v1');
ok(manifest.home === 'onboard', 'home is onboard');
ok(manifest.artifact === 'dist/index.html', 'artifact is dist/index.html');
const modIds = (manifest.required_modules || []).map((m) => m.id);
for (const id of REQUIRED_FLOOR) ok(modIds.includes(id), 'manifest still lists required module: ' + id);
for (const m of manifest.required_modules || []) {
  const nav = m.desktop_navigation || {};
  ok(!!(m.id && m.name && nav.route && nav.nav_selector && nav.render_function),
    (m.id || '?') + ': manifest entry has id/name/route/nav_selector/render_function');
}

// ---- static perimeter helpers ----
function selectorToken(sel) {
  const s = String(sel || '').trim();
  let m = s.match(/^\[([A-Za-z0-9_-]+)="([^"]*)"\]$/);
  if (m) return m[1] + '="' + m[2] + '"';
  m = s.match(/^#([A-Za-z0-9_-]+)$/);
  if (m) return 'id="' + m[1] + '"';
  return s;
}
function navOpeningTag(token) {
  const re = new RegExp('<[^>]*' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^>]*>');
  const m = HTML.match(re);
  return m ? m[0] : null;
}
const HIDING_DECL = /(?:^|[;{\s])(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|(?:width|height)\s*:\s*0(?:px)?\s*(?:;|$))/i;
function tagIsHidden(tag) {
  const style = (tag.match(/style\s*=\s*"([^"]*)"/i) || [])[1] || '';
  if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])/i.test(style)) return 'inline style hides it: ' + style;
  if (/\shidden(?=[\s>=])/i.test(tag) && !/aria-hidden/i.test(tag.match(/\shidden[^\s>]*/i)[0])) return 'hidden attribute';
  if (/aria-hidden\s*=\s*"true"/i.test(tag)) return 'aria-hidden="true"';
  const cls = (tag.match(/class\s*=\s*"([^"]*)"/i) || [])[1] || '';
  if (/\b(hidden|is-hidden|sr-only)\b/.test(cls)) return 'hiding class: ' + cls;
  return null;
}
// Parse stylesheet rules (media-query wrappers stripped; orphan braces are
// skipped by the rule regex).
function cssRules() {
  const styles = [...HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const flat = styles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '\n');
  const rules = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ selector: m[1].trim(), body: m[2] });
  return rules;
}
const RULES = cssRules();
function cssHidesToken(token) {
  return RULES.filter((r) =>
    r.selector.includes(token) &&
    !r.selector.includes(ALLOWED_HIDING_SCOPE) &&
    !r.selector.includes('::') && // pseudo-elements (::-webkit-scrollbar etc.) don't hide the module itself
    HIDING_DECL.test(r.body)
  );
}

section('static perimeter — nav present, not hidden inline, not hidden by CSS');
for (const token of GLOBAL_CSS_TOKENS) {
  const bad = cssHidesToken(token);
  ok(bad.length === 0, 'no stylesheet rule hides shared chrome ' + token + (bad.length ? ' — ' + bad[0].selector : ''));
}
for (const m of manifest.required_modules || []) {
  const token = selectorToken(m.desktop_navigation.nav_selector);
  const tag = navOpeningTag(token);
  ok(!!tag, m.name + ': nav element exists (' + token + ')');
  if (tag) {
    const hidden = tagIsHidden(tag);
    ok(!hidden, m.name + ': nav element is not hidden' + (hidden ? ' — ' + hidden : ''));
  }
  for (const ct of m.css_tokens || []) {
    const bad = cssHidesToken(ct);
    ok(bad.length === 0, m.name + ': no stylesheet rule hides "' + ct + '"' + (bad.length ? ' — ' + bad[0].selector : ''));
  }
}

// ---- runtime routes (same lightweight stub pattern as the other harnesses) ----
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

const renderFns = [...new Set((manifest.required_modules || []).map((m) => m.desktop_navigation.render_function))];
const EXPORTS = [...new Set(['showModule', 'showSettings', ...renderFns])];
let M;
try { M = new Function(script + '\nreturn {' + EXPORTS.join(',') + '};')(); }
catch (e) { console.error('load failed:', e); process.exit(1); }

section('runtime — render entry functions exist');
for (const fn of renderFns) ok(typeof M[fn] === 'function', 'render function exists: ' + fn);
ok(typeof M.showModule === 'function' && typeof M.showSettings === 'function', 'route drivers showModule/showSettings exist');

section('runtime — every required route opens its surface');
for (const m of manifest.required_modules || []) {
  const route = m.desktop_navigation.route;
  store.clear();
  els.forEach((el) => { el.innerHTML = ''; });
  let err = null;
  try { if (m.id === 'settings') M.showSettings(); else M.showModule(route); }
  catch (e) { err = e; }
  ok(!err, m.name + ': navigation "' + route + '" runs without throwing' + (err ? ' — ' + err : ''));
  const surface = m.id === 'settings'
    ? (els.get('settings-nav') || {}).innerHTML + '\n' + (els.get('settings-body') || {}).innerHTML
    : (els.get('scr-content') || {}).innerHTML;
  for (const marker of m.surface_markers || []) {
    ok(String(surface || '').includes(marker), m.name + ': surface shows marker ' + JSON.stringify(marker));
  }
}

console.log('\nonboard_presence_contract_harness: ' + (fail === 0 ? 'GREEN' : 'RED') + ' (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail === 0 ? 0 : 1);
