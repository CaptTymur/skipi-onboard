// Onboard Host Check — bundled first-party demo plugin (host-readiness fixture).
//
// Purpose: verify the On Board plugin host contract without any product logic.
// It self-registers into window.SkipiPlugins with a manifest + mount/unmount,
// and exercises the narrow host API (theme / sandboxed storage / navigation).
// It must NOT touch crew, vessel documents, certificates, pairing or the network.
//
// Real plugins are developed/tested in the plugin lab, not in the home repo
// (see Obsidian: "Skipi Plugin Lab", "Skipi Plugin Update Mechanism").
(function () {
  var manifest = {
    id: 'app.skipi.plugins.onboard-host-check',
    slug: 'onboard-host-check',
    name: 'Onboard Host Check',
    version: '0.1.0',
    developer: 'Skipi',
    kind: 'utility',
    category: 'utils',
    icon: '🧩',
    short: 'Demo fixture that verifies the On Board plugin host contract.',
    description: 'A tiny first-party demo plugin used to verify the On Board plugin host. It reads the host theme, persists a counter through the sandboxed host storage, sets the plugin title and closes itself via the host navigation API. It has no access to crew, vessel documents, certificates, pairing secrets or the network.',
    distribution: { mode: 'bundled_first_party', bundled: true, remote_code: false },
    hosts: ['onboard'],
    permissions: ['local_storage'],
    capabilities: { network: 'none', documents: 'none', account: 'none', analytics: 'none', server_upload: false },
    safety: { certified_equipment: false, requires_disclaimer: true, disclaimer: 'Demo fixture — verifies the plugin host only. Not an operational tool.' }
  };

  var state = { unsub: null };

  window.SkipiPlugins = window.SkipiPlugins || {};
  window.SkipiPlugins['onboard-host-check'] = {
    manifest: manifest,
    mount: function (container, host) {
      var theme = (host && host.theme && host.theme.get && host.theme.get()) || 'light';
      var count = (host && host.storage && host.storage.get('count')) || 0;
      container.innerHTML =
        '<div class="ohc">'
        + '<div class="ohc-row"><b>Host theme:</b> <span class="ohc-theme">' + theme + '</span></div>'
        + '<div class="ohc-row"><b>Sandboxed storage counter:</b> <span class="ohc-count">' + count + '</span></div>'
        + '<div class="ohc-actions">'
        + '<button class="ohc-btn ohc-inc" type="button">+1 (persist)</button>'
        + '<button class="ohc-btn ohc-title" type="button">Set host title</button>'
        + '<button class="ohc-btn ohc-close" type="button">Close (host API)</button>'
        + '</div>'
        + '<div class="ohc-note">Demo fixture — verifies the plugin host only. It cannot read crew, vessel documents, '
        + 'certificates or pairing data, and makes no network calls.</div>'
        + '</div>';

      container.querySelector('.ohc-inc').addEventListener('click', function () {
        count = ((host.storage.get('count') || 0) + 1);
        host.storage.set('count', count);
        container.querySelector('.ohc-count').textContent = count;
      });
      container.querySelector('.ohc-title').addEventListener('click', function () {
        if (host.navigation && host.navigation.setTitle) host.navigation.setTitle('Onboard Host Check ✓');
      });
      container.querySelector('.ohc-close').addEventListener('click', function () {
        if (host.navigation && host.navigation.closePlugin) host.navigation.closePlugin();
      });
      if (host.theme && host.theme.subscribe) {
        state.unsub = host.theme.subscribe(function (t) {
          var el = container.querySelector('.ohc-theme'); if (el) el.textContent = t;
        });
      }
    },
    unmount: function () {
      if (state.unsub) { try { state.unsub(); } catch (e) {} state.unsub = null; }
    }
  };
})();
