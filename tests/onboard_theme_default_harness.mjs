// Headless harness for the On Board theme contract (light by default +
// persisted user choice). Same canon as @skipi/settings commit 1a6748e:
//
//   1. no saved choice -> first boot is light;
//   2. chosen dark applies immediately and survives a restart;
//   3. chosen light persists the same way;
//   4. no hardcoded forced dark anywhere in the shell;
//   5. normalization: only the exact string 'dark' selects dark.
//
// Loads the REAL inline scripts from dist/index.html (head theme-boot block +
// main shell block) with the same stub pattern as the other On Board
// harnesses. "Restart" = re-running both blocks against the same storage.
//
//   node tests/onboard_theme_default_harness.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const blocks = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = blocks.reduce((a, b) => (a.length > b.length ? a : b), '');
if (!script) { console.error('no <script> block'); process.exit(1); }
// Head theme-boot block: small, runs before first paint, keyed on the persist key.
const bootBlock = blocks.find((b) => b !== script && b.includes('skipi-onboard-theme')) || '';
const css = [...HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const allJs = blocks.join('\n');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
};
const section = (title) => console.log('\n# ' + title);

// ---- stub environment; boot(store) simulates one app start on a device ----
const noop = () => {};
const staticThemeAttr = (HTML.match(/<html[^>]*\sdata-theme="([^"]*)"/) || [])[1] || null;

function boot(store) {
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
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
  const attrs = new Map();
  if (staticThemeAttr != null) attrs.set('data-theme', staticThemeAttr);
  const docEl = {
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
  };
  globalThis.document = {
    getElementById: (id) => elFor(id),
    querySelector: () => elFor('_q'),
    querySelectorAll: () => [],
    createElement: () => elFor('_c'),
    head: elFor('_head'),
    body: elFor('_body'),
    documentElement: docEl,
  };
  globalThis.window = globalThis;
  globalThis.__ONBOARD_NO_BOOT__ = true;
  globalThis.fetch = async () => ({ status: 599, ok: false, async json() { return {}; }, async text() { return ''; } });

  if (bootBlock) { try { new Function(bootBlock)(); } catch (e) { console.error('boot block threw:', e); } }

  const EXPORTS = ['applyTheme', 'makeHostApi', 'renderSettings', 'settingsSetTab', 'settingsState'];
  const body = script + '\nvar __out = {};\n'
    + EXPORTS.map((n) => 'try { __out.' + n + ' = ' + n + '; } catch (e) {}').join('\n')
    + '\nreturn __out;';
  let M = {};
  try { M = new Function(body)(); } catch (e) { console.error('main script load failed:', e); }
  return { M, docEl, els, store };
}

// ---- color helpers for the dark-palette check ----
function hexLum(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function varHex(block, name) {
  const m = block.match(new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{3,6})'));
  return m ? m[1] : null;
}

// (a) static markup ---------------------------------------------------------
section('a. static markup — light is the shipped default');
ok(/<html[^>]*\sdata-theme="light"/.test(HTML), '<html ... data-theme="light"> in static markup');

// (b) fresh boot ------------------------------------------------------------
section('b. fresh boot (empty persistence) -> light');
ok(bootBlock !== '', 'head theme-boot script block exists (keyed skipi-onboard-theme)');
const dev1 = boot(new Map());
ok(dev1.docEl.getAttribute('data-theme') === 'light', 'first boot with empty store renders data-theme="light"');

// (c) apply + persist + restart --------------------------------------------
section('c. applyTheme — immediate apply, persistence, restart survival, normalization');
ok(typeof dev1.M.applyTheme === 'function', 'applyTheme() exists in the shell script');
if (typeof dev1.M.applyTheme === 'function') {
  dev1.M.applyTheme('dark');
  ok(dev1.docEl.getAttribute('data-theme') === 'dark', "applyTheme('dark') switches data-theme immediately");
  ok(dev1.store.get('skipi-onboard-theme') === 'dark', "choice persisted under 'skipi-onboard-theme'");
  const restart1 = boot(dev1.store);
  ok(restart1.docEl.getAttribute('data-theme') === 'dark', 'restart on the same store boots dark');
  restart1.M.applyTheme('light');
  ok(restart1.docEl.getAttribute('data-theme') === 'light', "applyTheme('light') switches back immediately");
  ok(restart1.store.get('skipi-onboard-theme') === 'light', 'light choice persisted too');
  const restart2 = boot(restart1.store);
  ok(restart2.docEl.getAttribute('data-theme') === 'light', 'restart after choosing light boots light');
  // normalization through applyTheme: only the exact string 'dark' gives dark
  for (const junk of ['DARK', 'system', 'blue', '', null]) {
    const d = boot(new Map());
    d.M.applyTheme(junk);
    ok(d.docEl.getAttribute('data-theme') === 'light', 'applyTheme(' + JSON.stringify(junk) + ') normalizes to light');
  }
  // normalization at boot: junk in the store must not produce dark
  for (const junk of ['DARK', 'system', 'blue', '']) {
    const store = new Map([['skipi-onboard-theme', junk]]);
    const d = boot(store);
    ok(d.docEl.getAttribute('data-theme') === 'light', 'boot with stored ' + JSON.stringify(junk) + ' stays light');
  }
} else {
  ok(false, 'applyTheme missing: apply/persist/restart/normalization untestable');
}

// (d) dark palette in CSS ---------------------------------------------------
section('d. CSS — additive [data-theme="dark"] palette overrides');
const darkBlockM = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
ok(!!darkBlockM, 'stylesheet has a [data-theme="dark"] block');
if (darkBlockM) {
  const blk = darkBlockM[1];
  for (const v of ['bg', 'surface', 'text', 'text2', 'border', 'accent']) {
    ok(new RegExp('--' + v + '\\s*:').test(blk), 'dark block overrides --' + v);
  }
  const bg = varHex(blk, 'bg'), text = varHex(blk, 'text');
  ok(bg !== null && hexLum(bg) < 0.1, 'dark --bg is actually dark (' + bg + ')');
  ok(text !== null && hexLum(text) > 0.6, 'dark --text is actually light (' + text + ')');
}

// (e) no hardcoded dark -----------------------------------------------------
section('e. no hardcoded forced-dark patterns in scripts');
ok(!/\|\|\s*['"]dark['"]/.test(allJs), "no `|| 'dark'` fallback");
ok(!/[A-Za-z0-9_$\])]\s*=\s*['"]dark['"]/.test(allJs), "no `theme = 'dark'` style init/assignment");
ok(!/return\s+['"]dark['"]/.test(allJs), "no bare `return 'dark'`");

// (f) settings surface has the switcher ------------------------------------
section('f. settings surface — theme switcher wired to applyTheme');
{
  const d = boot(new Map());
  let found = null;
  if (typeof d.M.settingsSetTab === 'function') {
    for (const tab of ['vessel', 'crew', 'devices', 'connection', 'workflow', 'security', 'about']) {
      d.M.settingsSetTab(tab);
      const body = d.els.get('settings-body') ? d.els.get('settings-body').innerHTML : '';
      if (body.includes('data-qa="onboard-theme-light"') && body.includes('data-qa="onboard-theme-dark"')) { found = { tab, body }; break; }
    }
  }
  ok(!!found, 'a settings tab renders Light/Dark controls (onboard-theme-light/-dark hooks)');
  if (found) {
    ok(found.body.includes("applyTheme('light')") && found.body.includes("applyTheme('dark')"),
      'switcher buttons call applyTheme');
    // active state follows the current theme after re-render
    d.M.applyTheme('dark');
    d.M.settingsSetTab(found.tab);
    const body2 = d.els.get('settings-body').innerHTML;
    ok(/data-qa="onboard-theme-dark"/.test(body2), 'switcher still present after switching to dark');
  }
}

// (g) plugin bridge ---------------------------------------------------------
section('g. plugin bridge — theme changes reach plugins');
{
  const d = boot(new Map());
  ok(typeof d.M.makeHostApi === 'function', 'makeHostApi() exists');
  if (typeof d.M.makeHostApi === 'function' && typeof d.M.applyTheme === 'function') {
    const api = d.M.makeHostApi('theme-probe');
    ok(api && api.theme && typeof api.theme.subscribe === 'function', 'host api exposes theme.subscribe');
    const seen = [];
    const unsub = api.theme.subscribe((t) => seen.push(t));
    d.M.applyTheme('dark');
    ok(seen.length === 1 && seen[0] === 'dark', 'theme.subscribe callback notified with "dark"');
    ok(api.theme.get() === 'dark', 'host api theme.get() reflects the applied theme');
    if (typeof unsub === 'function') unsub();
    d.M.applyTheme('light');
    ok(seen.length === 1, 'unsubscribe stops notifications');
    ok(String(d.M.applyTheme).includes('pushTheme'), 'applyTheme pushes the theme to the active plugin frame (pushTheme)');
  } else {
    ok(false, 'applyTheme/makeHostApi missing: plugin notification untestable');
  }
}

console.log('\n' + (fail === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
