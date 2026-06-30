// Ship Photo Collection — On Board receiver fixture (dev-only bundled).
//
// This is the vessel-side inbox for local QA of photo transfer. It consumes
// only the narrow On Board host API:
//   vessel.getContext()
//   inbox.list/get/setStatus/photoUrl()
// The host injects auth and forces vessel IMO; the plugin never receives
// ONBOARD_TOKEN, API base, crew config, or network primitives.
(function () {
  var manifest = {
    id: 'app.skipi.plugins.ship-photo-collection',
    slug: 'ship-photo-collection',
    name: 'Ship Photo Collection',
    version: '0.1.0-dev-receiver',
    developer: 'Skipi',
    kind: 'workflow',
    category: 'reports',
    icon: '📷',
    short: 'Vessel-side inbox for photo reports.',
    description: 'Dev-only bundled receiver fixture for the ship-photo-collection workflow. It lists photo reports for the configured vessel through the On Board host API. The host mediates every backend call and never exposes ONBOARD_TOKEN to plugin JavaScript.',
    distribution: { mode: 'bundled_first_party', bundled: true, remote_code: false },
    dev_only: true,
    hosts: ['onboard'],
    permissions: ['vessel.context', 'inbox.read', 'inbox.manage'],
    capabilities: { network: 'host-mediated', documents: 'none', account: 'none', analytics: 'none', server_upload: false },
    safety: { certified_equipment: false, requires_disclaimer: true, disclaimer: 'Dev-only receiver fixture. It reads photo reports for the configured vessel through the host. It does not upload photos and does not receive the vessel bearer token.' }
  };

  var state = { container: null, host: null, reports: [], selected: null, loading: false, error: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleString(); } catch (e) { return s; }
  }
  function statusClass(s) {
    return s === 'submitted' ? 'spc-warn' : (s === 'reviewed' || s === 'archived') ? 'spc-ok' : 'spc-info';
  }
  function stateCopy(s) {
    return ({
      backend_off: 'Receiver backend is off in this build. Enable dev live mode and configure API base/token/IMO.',
      no_config: 'Configure API base, ONBOARD_TOKEN, and vessel IMO in Settings -> Подключение.',
      unauthorized: 'Backend rejected the vessel token.',
      unavailable: 'Backend is unavailable.',
      permission_denied: 'Plugin permission denied by host.',
      empty: 'No incoming photo reports for this vessel yet.',
      bad_request: 'Bad report request.',
      forbidden_vessel: 'This report belongs to another vessel and was blocked by the host.',
      not_found: 'Report not found.'
    })[s] || ('State: ' + s);
  }
  function ctx() {
    try { return state.host && state.host.vessel && state.host.vessel.getContext ? state.host.vessel.getContext() : { ok: false, state: 'permission_denied' }; }
    catch (e) { return { ok: false, state: 'unavailable' }; }
  }
  function render() {
    var c = state.container;
    if (!c) return;
    var v = ctx();
    var title = (v && v.vessel_name) ? v.vessel_name : ((v && v.vessel_imo) ? ('IMO ' + v.vessel_imo) : 'No vessel');
    var h = '<div class="spc">'
      + '<div class="spc-head"><div><div class="spc-kicker">DEV RECEIVER · HOST-MEDIATED</div>'
      + '<div class="spc-title">Ship Photo Collection</div>'
      + '<div class="spc-sub">Incoming photo reports for ' + esc(title) + '</div></div>'
      + '<button class="spc-btn" type="button" data-spc-action="refresh">Refresh</button></div>'
      + '<div class="spc-note">The plugin receives only vessel context and inbox envelopes. The host injects auth and forces the configured vessel IMO.</div>';
    if (!v || !v.ok) {
      h += '<div class="spc-state">' + esc(stateCopy(v && v.state)) + '</div></div>';
      c.innerHTML = h; bind(); return;
    }
    if (state.loading) {
      h += '<div class="spc-state">Loading photo inbox…</div></div>';
      c.innerHTML = h; bind(); return;
    }
    if (state.error) {
      h += '<div class="spc-state">' + esc(stateCopy(state.error)) + '</div></div>';
      c.innerHTML = h; bind(); return;
    }
    if (!state.selected) {
      h += listHtml();
    } else {
      h += detailHtml(state.selected);
    }
    h += '</div>';
    c.innerHTML = h;
    bind();
  }
  function listHtml() {
    if (!state.reports.length) return '<div class="spc-state">No incoming photo reports for this vessel yet.</div>';
    var h = '<div class="spc-list">';
    state.reports.forEach(function (r) {
      var img = r.thumbnail_url ? '<img class="spc-thumb" src="' + esc(r.thumbnail_url) + '" alt="thumbnail">' : '<div class="spc-thumb empty">📷</div>';
      h += '<button class="spc-card" type="button" data-spc-open="' + esc(r.id) + '">'
        + img
        + '<span class="spc-card-body"><span class="spc-card-title">' + esc(r.title || r.work_type || 'Photo report') + '</span>'
        + '<span class="spc-meta">' + esc([r.location, r.performed_by, fmt(r.submitted_at)].filter(Boolean).join(' · ')) + '</span>'
        + '<span><span class="spc-pill ' + statusClass(r.status) + '">' + esc(r.status || 'submitted') + '</span>'
        + '<span class="spc-count">' + esc(r.photo_count || 0) + ' photo(s)</span></span></span></button>';
    });
    return h + '</div>';
  }
  function detailHtml(r) {
    var photos = r.photos || [];
    var h = '<button class="spc-back" type="button" data-spc-action="back">← Inbox</button>'
      + '<div class="spc-detail"><div class="spc-card-title">' + esc(r.title || r.work_type || 'Photo report') + '</div>'
      + '<div class="spc-meta">' + esc([r.location, r.performed_by, fmt(r.submitted_at)].filter(Boolean).join(' · ')) + '</div>'
      + '<div style="margin-top:8px"><span class="spc-pill ' + statusClass(r.status) + '">' + esc(r.status || 'submitted') + '</span></div>';
    if (r.notes) h += '<p class="spc-text">' + esc(r.notes) + '</p>';
    h += '<div class="spc-actions">'
      + '<button class="spc-btn" type="button" data-spc-status="received">Mark received</button>'
      + '<button class="spc-btn" type="button" data-spc-status="reviewed">Mark reviewed</button>'
      + '<button class="spc-btn" type="button" data-spc-status="archived">Archive</button>'
      + '</div>';
    if (!photos.length) {
      h += '<div class="spc-state">No photos attached.</div>';
    } else {
      h += '<div class="spc-photos">';
      photos.forEach(function (p) {
        var url = state.host.inbox.photoUrl(p);
        h += '<figure class="spc-photo">'
          + (url ? '<img src="' + esc(url) + '" alt="report photo">' : '<div class="spc-photo-missing">media blocked</div>')
          + '<figcaption>' + esc([p.phase, p.caption].filter(Boolean).join(' · ') || 'photo') + '</figcaption></figure>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }
  function bind() {
    var c = state.container;
    if (!c) return;
    var refresh = c.querySelector('[data-spc-action="refresh"]');
    if (refresh) refresh.addEventListener('click', loadList);
    var back = c.querySelector('[data-spc-action="back"]');
    if (back) back.addEventListener('click', function () { state.selected = null; render(); });
    Array.prototype.forEach.call(c.querySelectorAll('[data-spc-open]'), function (el) {
      el.addEventListener('click', function () { openReport(el.getAttribute('data-spc-open')); });
    });
    Array.prototype.forEach.call(c.querySelectorAll('[data-spc-status]'), function (el) {
      el.addEventListener('click', function () { setStatus(el.getAttribute('data-spc-status')); });
    });
  }
  function loadList() {
    state.loading = true; state.error = null; render();
    state.host.inbox.list({ limit: 50 }).then(function (res) {
      state.loading = false;
      if (!res.ok && res.state !== 'empty') { state.error = res.state || 'unavailable'; state.reports = []; }
      else { state.error = null; state.reports = res.items || []; }
      render();
    }, function () {
      state.loading = false; state.error = 'unavailable'; render();
    });
  }
  function openReport(id) {
    state.loading = true; state.error = null; render();
    state.host.inbox.get(id).then(function (res) {
      state.loading = false;
      if (!res.ok) { state.error = res.state || 'unavailable'; state.selected = null; }
      else { state.selected = res.report; state.error = null; }
      render();
    }, function () {
      state.loading = false; state.error = 'unavailable'; render();
    });
  }
  function setStatus(next) {
    if (!state.selected) return;
    state.loading = true; render();
    state.host.inbox.setStatus(state.selected.id, next).then(function (res) {
      state.loading = false;
      if (!res.ok) { state.error = res.state || 'unavailable'; }
      else { state.selected = res.report; state.error = null; loadList(); }
      render();
    }, function () {
      state.loading = false; state.error = 'unavailable'; render();
    });
  }

  window.SkipiPlugins = window.SkipiPlugins || {};
  window.SkipiPlugins['ship-photo-collection'] = {
    manifest: manifest,
    mount: function (container, host) {
      state.container = container;
      state.host = host;
      state.reports = [];
      state.selected = null;
      state.error = null;
      if (host.navigation && host.navigation.setTitle) host.navigation.setTitle('Ship Photo Collection');
      loadList();
    },
    unmount: function () {
      state.container = null;
      state.host = null;
      state.reports = [];
      state.selected = null;
      state.error = null;
    }
  };
})();
