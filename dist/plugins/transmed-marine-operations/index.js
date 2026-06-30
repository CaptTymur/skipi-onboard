/* ===========================================================================
   Transmed Marine Operations — Outstandings plugin lab (HONEST FIXTURE SHELL)
   ---------------------------------------------------------------------------
   Phase-0 frozen scope:
     - Management -> fleet-scoped Outstandings board (Skipi Management)
     - Vessel     -> own-vessel Outstandings queue (Skipi On Board)

   Fixture-first shell. No direct network, no direct file I/O, no old database
   access, no signing, no catalog. If an On Board host exposes
   host.operations.*, vessel-role actions use that host-mediated backend.
   Otherwise mutations are in-memory and keep honest sync_state values:
   local_draft or queued only.

   Registers:
   window.SkipiPlugins["transmed-marine-operations"] = { manifest, mount, unmount }
   =========================================================================== */
(function () {
  'use strict';

  var KEY = 'transmed-marine-operations';
  var MANIFEST = {"id":"transmed-marine-operations","fqid":"app.skipi.plugins.transmed-marine-operations","name":"Transmed Marine Operations","nameRu":"Transmed Marine Operations","version":"0.1.0","developer":"Skipi (first-party)","kind":"workflow","distribution":{"mode":"bundled_first_party_or_signed_pack","remote_code":false},"supported_hosts":["management","onboard"],"entrypoints":{"ui":"index.js","style":"index.css"},"roles":{"management":{"role":"management","context":"fleet_operations","capabilities":["fleet.vessels.read","operations.items.read","operations.items.write","operations.items.assign","operations.items.close","operations.references.read","operations.reports.read","files.attach.read","files.attach.write","audit.read"]},"onboard":{"role":"vessel","context":"vessel_operations","capabilities":["vessel.current.read","operations.items.read_own_vessel","operations.items.update_own_vessel","operations.items.create_own_vessel","files.attach.write","queue.outbox"]}},"network":"host-mediated","data_access":"role_scoped","workflow":{"type":"outstandings","legacy_source":"Transmed_Marine Delphi VCL","mvp":["outstandings_board","management_create_edit_assign_close","vessel_ack_update_comment_create_own","attachment_placeholder","audit_history","html_print_view"],"status_model":["open","acknowledged","in_progress","waiting_shore","waiting_vessel","completed_by_vessel","closed"],"sync_states":["local_draft","queued","synced","failed"]},"safety":{"no_raw_sql":true,"no_plaintext_passwords":true,"no_cross_vessel_access_from_vessel_role":true,"audit_every_change":true,"honest_fixture_mode":true}};
  var current = null;
  var localSeq = 10;

  var STATUSES = [
    'open',
    'acknowledged',
    'in_progress',
    'waiting_shore',
    'waiting_vessel',
    'completed_by_vessel',
    'closed'
  ];

  var PRIORITIES = ['critical', 'high', 'urgent', 'normal', 'low'];
  var DEPARTMENTS = ['TECH', 'MAR', 'OPS'];
  var KINDS = ['technical outstanding', 'safety equipment', 'spares', 'operations'];
  var PICS = [
    { id: 'shore-tr', label: 'MAR-TR' },
    { id: 'shore-ap', label: 'TECH-AP' },
    { id: 'shore-ga', label: 'TECH-GA' },
    { id: 'shore-kt', label: 'OPS-KT' }
  ];

  var state = {
    vessels: [
      { id: 'v-akaki', name: 'Akaki', fleet: 'Fleet A', status: 'At sea' },
      { id: 'v-arsinoe', name: 'Arsinoe', fleet: 'Fleet A', status: 'Alongside' },
      { id: 'v-dignity', name: 'Dignity', fleet: 'Fleet B', status: 'At sea' },
      { id: 'v-nicolemy', name: 'Nicolemy', fleet: 'Fleet B', status: 'Dry dock' }
    ],
    items: [
      {
        id: 'TMO-001',
        vesselId: 'v-akaki',
        vessel: 'Akaki',
        fleet: 'Fleet A',
        department: 'TECH',
        kind: 'technical outstanding',
        priority: 'urgent',
        status: 'open',
        pic: 'MAR-TR',
        title: 'Emergency hatch pump inspection overdue',
        description: 'Verify condition, spares and last inspection record.',
        sourceRole: 'management',
        syncState: 'queued',
        attachmentState: 'placeholder',
        updated: '2026-06-21'
      },
      {
        id: 'TMO-002',
        vesselId: 'v-akaki',
        vessel: 'Akaki',
        fleet: 'Fleet A',
        department: 'MAR',
        kind: 'safety equipment',
        priority: 'normal',
        status: 'in_progress',
        pic: 'TECH-AP',
        title: 'Liferaft certificate renewal evidence',
        description: 'Attach service certificate and update comments.',
        sourceRole: 'management',
        syncState: 'local_draft',
        attachmentState: 'placeholder',
        updated: '2026-06-24'
      },
      {
        id: 'TMO-003',
        vesselId: 'v-arsinoe',
        vessel: 'Arsinoe',
        fleet: 'Fleet A',
        department: 'OPS',
        kind: 'operations',
        priority: 'normal',
        status: 'waiting_vessel',
        pic: 'OPS-KT',
        title: 'ETA update required before next noon report',
        description: 'Confirm port call ETA/ETB/ETC/ETS.',
        sourceRole: 'management',
        syncState: 'queued',
        attachmentState: 'placeholder',
        updated: '2026-06-25'
      },
      {
        id: 'TMO-004',
        vesselId: 'v-dignity',
        vessel: 'Dignity',
        fleet: 'Fleet B',
        department: 'TECH',
        kind: 'spares',
        priority: 'urgent',
        status: 'completed_by_vessel',
        pic: 'TECH-GA',
        title: 'Mooring rope order confirmation',
        description: 'Vessel confirmed receipt; waiting shore close.',
        sourceRole: 'management',
        syncState: 'queued',
        attachmentState: 'placeholder',
        updated: '2026-06-22'
      }
    ],
    audit: [
      { itemId: 'TMO-001', line: '2026-06-21 09:20 MAR-TR created item' },
      { itemId: 'TMO-001', line: '2026-06-22 13:10 TECH-AP changed priority normal -> urgent' },
      { itemId: 'TMO-002', line: '2026-06-24 15:45 vessel added processing comment' },
      { itemId: 'TMO-004', line: '2026-06-22 16:05 vessel changed status to completed_by_vessel' }
    ],
    comments: [
      { itemId: 'TMO-002', author: 'Akaki', text: 'Service certificate will be attached after backend evidence storage is available.' }
    ],
    outbox: [
      { id: 'Q-001', itemId: 'TMO-002', action: 'comment', syncState: 'queued' }
    ]
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function textButton(label, cls, onClick) {
    var b = el('button', cls || 'tmo-button', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function resolveRole(hostApi) {
    if (hostApi && typeof hostApi.role === 'string') return hostApi.role;
    var id = (hostApi && hostApi.host && hostApi.host.id) || (hostApi && hostApi.host_id) || null;
    if (id && MANIFEST.roles && MANIFEST.roles[id]) return MANIFEST.roles[id].role;
    return null;
  }

  function vesselFromHost(hostApi) {
    if (hostApi && hostApi.vessel && hostApi.vessel.name) return hostApi.vessel.name;
    if (hostApi && hostApi.vessel && typeof hostApi.vessel.getContext === 'function') {
      try {
        var ctx = hostApi.vessel.getContext();
        if (ctx && ctx.vessel_name) return ctx.vessel_name;
        if (ctx && ctx.vessel_imo) return 'IMO ' + ctx.vessel_imo;
      } catch (e) {}
    }
    if (hostApi && hostApi.currentVessel && hostApi.currentVessel.name) return hostApi.currentVessel.name;
    return 'Akaki';
  }

  function vesselByName(name) {
    for (var i = 0; i < state.vessels.length; i++) if (state.vessels[i].name === name) return state.vessels[i];
    return state.vessels[0];
  }

  function itemById(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return state.items[0] || null;
  }

  function itemByIdIn(items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return items[0] || null;
  }

  function itemsForVessel(name) {
    var out = [];
    for (var i = 0; i < state.items.length; i++) if (state.items[i].vessel === name) out.push(state.items[i]);
    return out;
  }

  function titleCase(s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function addAudit(itemId, line) {
    state.audit.push({ itemId: itemId, line: 'fixture ' + line });
  }

  function addOutbox(itemId, action) {
    state.outbox.push({ id: 'Q-' + String(state.outbox.length + 1).padStart(3, '0'), itemId: itemId, action: action, syncState: 'queued' });
  }

  function countWhere(items, field, value) {
    var c = 0;
    for (var i = 0; i < items.length; i++) if (items[i][field] === value) c++;
    return c;
  }

  function makeSelect(label, values, selected, onChange) {
    var wrap = el('label', 'tmo-filter');
    wrap.appendChild(el('span', null, label));
    var select = el('select');
    for (var i = 0; i < values.length; i++) {
      var opt = el('option', null, values[i].label);
      opt.value = values[i].value;
      if (values[i].value === selected) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', function () { onChange(select.value); });
    wrap.appendChild(select);
    return wrap;
  }

  function optionList(values, allLabel) {
    var out = [];
    if (allLabel) out.push({ value: 'all', label: allLabel });
    for (var i = 0; i < values.length; i++) out.push({ value: values[i], label: titleCase(values[i]) });
    return out;
  }

  function shell(root, title, subtitle, roleLabel, modeLabel, warningText) {
    var header = el('div', 'tmo-header');
    var titleBox = el('div');
    titleBox.appendChild(el('div', 'tmo-title', title));
    titleBox.appendChild(el('div', 'tmo-subtitle', subtitle));
    header.appendChild(titleBox);
    var mode = el('div', 'tmo-mode');
    mode.appendChild(el('span', 'tmo-role', roleLabel));
    mode.appendChild(el('span', 'tmo-badge', modeLabel || 'FIXTURE MODE'));
    header.appendChild(mode);
    root.appendChild(header);
    root.appendChild(el('div', 'tmo-warning', warningText || 'Backend is not connected. Fixture mutations stay local_draft or queued until a future server acknowledgement.'));
  }

  function summary(root, items) {
    var metrics = el('div', 'tmo-metrics');
    [
      ['Vessels', String(state.vessels.length)],
      ['Open', String(countWhere(items, 'status', 'open'))],
      ['In progress', String(countWhere(items, 'status', 'in_progress'))],
      ['Urgent', String(countWhere(items, 'priority', 'urgent'))],
      ['Queued', String(countWhere(items, 'syncState', 'queued'))]
    ].forEach(function (pair) {
      var metric = el('div', 'tmo-metric');
      metric.appendChild(el('span', 'tmo-metric-value', pair[1]));
      metric.appendChild(el('span', 'tmo-metric-label', pair[0]));
      metrics.appendChild(metric);
    });
    root.appendChild(metrics);
  }

  function itemMatches(item, filters) {
    if (filters.vessel && filters.vessel !== 'all' && item.vessel !== filters.vessel) return false;
    if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.priority && filters.priority !== 'all' && item.priority !== filters.priority) return false;
    if (filters.department && filters.department !== 'all' && item.department !== filters.department) return false;
    return true;
  }

  function table(container, items, selectedId, onSelect) {
    var t = el('table', 'tmo-table');
    var thead = el('thead');
    var hr = el('tr');
    ['ID', 'Vessel', 'Dept', 'Status', 'Priority', 'PIC', 'Sync', 'Title'].forEach(function (h) {
      hr.appendChild(el('th', null, h));
    });
    thead.appendChild(hr);
    t.appendChild(thead);
    var tbody = el('tbody');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var tr = el('tr', item.id === selectedId ? 'is-selected' : '');
      tr.setAttribute('data-id', item.id);
      [item.id, item.vessel, item.department, item.status, item.priority, item.pic, item.syncState, item.title].forEach(function (v) {
        tr.appendChild(el('td', null, titleCase(v)));
      });
      tr.addEventListener('click', function () { onSelect(this.getAttribute('data-id')); });
      tbody.appendChild(tr);
    }
    t.appendChild(tbody);
    container.appendChild(t);
  }

  function auditBlock(item) {
    var audit = el('div', 'tmo-audit');
    audit.appendChild(el('div', 'tmo-section-title', 'UpdHistory view'));
    var found = false;
    for (var i = 0; i < state.audit.length; i++) {
      if (state.audit[i].itemId === item.id) {
        audit.appendChild(el('div', 'tmo-audit-line', state.audit[i].line));
        found = true;
      }
    }
    if (!found) audit.appendChild(el('div', 'tmo-muted', 'No fixture audit events yet.'));
    return audit;
  }

  function commentsBlock(item) {
    var block = el('div', 'tmo-comments');
    block.appendChild(el('div', 'tmo-section-title', 'Comments'));
    if (item && item.__server) {
      block.appendChild(el('div', 'tmo-muted', 'Server comments are written through the host. Full comment history lands in the next detail endpoint pass.'));
      return block;
    }
    var found = false;
    for (var i = 0; i < state.comments.length; i++) {
      if (state.comments[i].itemId === item.id) {
        block.appendChild(el('div', 'tmo-comment', state.comments[i].author + ': ' + state.comments[i].text));
        found = true;
      }
    }
    if (!found) block.appendChild(el('div', 'tmo-muted', 'No comments in fixture.'));
    return block;
  }

  function fieldsBlock(item) {
    var fields = el('div', 'tmo-fields');
    [
      ['Priority', item.priority],
      ['PIC', item.pic],
      ['Kind', item.kind],
      ['Source', item.sourceRole],
      ['Sync state', item.syncState],
      ['Attachment', item.attachmentState]
    ].forEach(function (pair) {
      var f = el('div', 'tmo-field');
      f.appendChild(el('span', 'tmo-field-label', pair[0]));
      f.appendChild(el('span', 'tmo-field-value', titleCase(pair[1])));
      fields.appendChild(f);
    });
    return fields;
  }

  function mapServerItem(raw, vesselName) {
    raw = raw || {};
    return {
      id: raw.id,
      vesselId: 'server-' + (raw.vessel_imo || 'own'),
      vessel: vesselName || raw.vessel_name || (raw.vessel_imo ? 'IMO ' + raw.vessel_imo : 'Own vessel'),
      fleet: 'Host scoped',
      department: raw.department || 'TECH',
      kind: raw.kind || 'operations',
      priority: raw.priority || 'normal',
      status: raw.status || 'open',
      pic: raw.pic_name || 'shore triage',
      title: raw.title || 'Untitled outstanding',
      description: raw.description || '',
      sourceRole: raw.source || 'server',
      syncState: 'synced',
      attachmentState: 'host-mediated',
      updated: raw.updated_at || raw.created_at || 'server',
      __server: true
    };
  }

  function detail(container, item, title) {
    if (!item) {
      container.appendChild(el('div', 'tmo-empty', 'No fixture items.'));
      return;
    }
    var d = el('section', 'tmo-detail');
    d.appendChild(el('div', 'tmo-section-title', title));
    d.appendChild(el('div', 'tmo-detail-title', item.id + ' - ' + item.title));
    d.appendChild(el('div', 'tmo-detail-meta', item.vessel + ' | ' + item.department + ' | ' + titleCase(item.status)));
    d.appendChild(el('p', 'tmo-description', item.description));
    d.appendChild(fieldsBlock(item));
    d.appendChild(commentsBlock(item));
    d.appendChild(auditBlock(item));
    container.appendChild(d);
  }

  function createManagementItem(selectedVessel) {
    var vessel = selectedVessel === 'all' ? state.vessels[0] : vesselByName(selectedVessel);
    var id = 'TMO-' + String(localSeq++).padStart(3, '0');
    var item = {
      id: id,
      vesselId: vessel.id,
      vessel: vessel.name,
      fleet: vessel.fleet,
      department: 'TECH',
      kind: 'technical outstanding',
      priority: 'normal',
      status: 'open',
      pic: 'MAR-TR',
      title: 'Fixture management-created outstanding',
      description: 'Created in lab fixture mode. It is not synced until backend exists.',
      sourceRole: 'management',
      syncState: 'local_draft',
      attachmentState: 'placeholder',
      updated: 'fixture'
    };
    state.items.unshift(item);
    addAudit(id, 'management created outstanding in local fixture');
    return item;
  }

  function createVesselItem(vesselName) {
    var vessel = vesselByName(vesselName);
    var id = 'TMO-' + String(localSeq++).padStart(3, '0');
    var item = {
      id: id,
      vesselId: vessel.id,
      vessel: vessel.name,
      fleet: vessel.fleet,
      department: 'TECH',
      kind: 'technical outstanding',
      priority: 'normal',
      status: 'open',
      pic: 'shore triage',
      title: 'Fixture vessel-originated defect request',
      description: 'Created by vessel role and queued for shore triage after backend.',
      sourceRole: 'vessel',
      syncState: 'local_draft',
      attachmentState: 'placeholder',
      updated: 'fixture'
    };
    state.items.unshift(item);
    addAudit(id, 'vessel created own-vessel item in local fixture');
    addOutbox(id, 'create_own');
    return item;
  }

  function setField(item, field, value, actor) {
    if (!item || item[field] === value) return;
    var old = item[field];
    item[field] = value;
    item.syncState = 'queued';
    item.updated = 'fixture';
    addAudit(item.id, actor + ' changed ' + field + ' ' + old + ' -> ' + value);
    addOutbox(item.id, 'update_' + field);
  }

  function addComment(item, author, text) {
    state.comments.push({ itemId: item.id, author: author, text: text });
    item.syncState = 'queued';
    addAudit(item.id, author + ' added comment');
    addOutbox(item.id, 'comment');
  }

  function controlBar(item, role, repaint, handlers) {
    var bar = el('div', 'tmo-controls');
    if (!item) return bar;
    handlers = handlers || {};
    if (role === 'management') {
      bar.appendChild(makeSelect('Status', optionList(STATUSES, null), item.status, function (v) { setField(item, 'status', v, 'management'); repaint(); }));
      bar.appendChild(makeSelect('Priority', optionList(PRIORITIES, null), item.priority, function (v) { setField(item, 'priority', v, 'management'); repaint(); }));
      bar.appendChild(makeSelect('PIC', PICS.map(function (p) { return { value: p.label, label: p.label }; }), item.pic, function (v) { setField(item, 'pic', v, 'management'); repaint(); }));
      bar.appendChild(makeSelect('Kind', optionList(KINDS, null), item.kind, function (v) { setField(item, 'kind', v, 'management'); repaint(); }));
      bar.appendChild(textButton('Accept close', 'tmo-button', function () { setField(item, 'status', 'closed', 'management'); repaint(); }));
      bar.appendChild(textButton('Reject reopen', 'tmo-button', function () { setField(item, 'status', 'in_progress', 'management'); repaint(); }));
      bar.appendChild(textButton('Add management comment', 'tmo-button', function () { addComment(item, 'management', 'Fixture management comment'); repaint(); }));
    } else if (role === 'vessel') {
      function updateStatus(v) {
        if (handlers.setStatus) handlers.setStatus(item, v);
        else { setField(item, 'status', v, 'vessel'); repaint(); }
      }
      bar.appendChild(textButton('Acknowledge', 'tmo-button', function () { updateStatus('acknowledged'); }));
      bar.appendChild(textButton('In progress', 'tmo-button', function () { updateStatus('in_progress'); }));
      bar.appendChild(textButton('Waiting shore', 'tmo-button', function () { updateStatus('waiting_shore'); }));
      bar.appendChild(textButton('Completed by vessel', 'tmo-button', function () { updateStatus('completed_by_vessel'); }));
      bar.appendChild(textButton('Add vessel comment', 'tmo-button', function () {
        if (handlers.addComment) handlers.addComment(item, 'Vessel comment');
        else { addComment(item, item.vessel, 'Fixture vessel comment queued locally'); repaint(); }
      }));
      bar.appendChild(textButton('Attach placeholder', 'tmo-button', function () {
        item.attachmentState = 'placeholder_local_draft';
        item.syncState = item.__server ? 'queued' : 'queued';
        addAudit(item.id, 'vessel added attachment placeholder');
        if (!item.__server) addOutbox(item.id, 'attach_placeholder');
        repaint();
      }));
    }
    return bar;
  }

  function printView(items) {
    var section = el('section', 'tmo-print-view');
    section.appendChild(el('div', 'tmo-section-title', 'HTML print view'));
    var lines = el('div', 'tmo-print-lines');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      lines.appendChild(el('div', 'tmo-print-line',
        item.id + ' | ' + item.vessel + ' | ' + item.department + ' | ' + titleCase(item.status) + ' | ' + titleCase(item.priority) + ' | ' + item.title));
    }
    section.appendChild(lines);
    return section;
  }

  function renderManagement(root, hostApi) {
    var view = { vessel: 'all', status: 'all', priority: 'all', department: 'all', selected: 'TMO-001', showPrint: false };
    shell(root, 'Outstandings', 'Fleet operations - management role', 'management');
    summary(root, state.items);
    var body = el('div', 'tmo-layout');
    var listPane = el('section', 'tmo-list-pane');
    var detailPane = el('section', 'tmo-detail-pane');
    body.appendChild(listPane);
    body.appendChild(detailPane);
    root.appendChild(body);

    function filteredItems() {
      var out = [];
      for (var i = 0; i < state.items.length; i++) if (itemMatches(state.items[i], view)) out.push(state.items[i]);
      return out;
    }

    function repaint() {
      clear(listPane);
      clear(detailPane);
      var filters = el('div', 'tmo-filters');
      var vessels = [{ value: 'all', label: 'All vessels' }];
      for (var i = 0; i < state.vessels.length; i++) vessels.push({ value: state.vessels[i].name, label: state.vessels[i].name });
      filters.appendChild(makeSelect('Vessel', vessels, view.vessel, function (v) { view.vessel = v; repaint(); }));
      filters.appendChild(makeSelect('Status', optionList(STATUSES, 'All statuses'), view.status, function (v) { view.status = v; repaint(); }));
      filters.appendChild(makeSelect('Priority', optionList(PRIORITIES, 'All priorities'), view.priority, function (v) { view.priority = v; repaint(); }));
      filters.appendChild(makeSelect('Dept', optionList(DEPARTMENTS, 'All departments'), view.department, function (v) { view.department = v; repaint(); }));
      listPane.appendChild(filters);

      var toolbar = el('div', 'tmo-toolbar');
      toolbar.appendChild(textButton('Create outstanding', 'tmo-button tmo-primary', function () { var item = createManagementItem(view.vessel); view.selected = item.id; repaint(); }));
      toolbar.appendChild(textButton(view.showPrint ? 'Hide print view' : 'Show print view', 'tmo-button', function () { view.showPrint = !view.showPrint; repaint(); }));
      listPane.appendChild(toolbar);

      var rows = filteredItems();
      listPane.appendChild(el('div', 'tmo-list-count', String(rows.length) + ' fixture outstandings'));
      table(listPane, rows, view.selected, function (id) { view.selected = id; repaint(); });
      if (view.showPrint) listPane.appendChild(printView(rows));

      var selected = itemById(view.selected);
      detailPane.appendChild(controlBar(selected, 'management', repaint));
      detail(detailPane, selected, 'Selected outstanding');
    }

    repaint();
    if (hostApi && hostApi.navigation && typeof hostApi.navigation.setTitle === 'function') {
      try { hostApi.navigation.setTitle('Outstandings'); } catch (e) {}
    }
  }

  function renderOutbox(container, vesselName) {
    var block = el('section', 'tmo-outbox');
    block.appendChild(el('div', 'tmo-section-title', 'Offline outbox'));
    var any = false;
    for (var i = 0; i < state.outbox.length; i++) {
      var item = itemById(state.outbox[i].itemId);
      if (item && item.vessel === vesselName) {
        block.appendChild(el('div', 'tmo-outbox-line', state.outbox[i].id + ' | ' + state.outbox[i].action + ' | ' + state.outbox[i].syncState));
        any = true;
      }
    }
    if (!any) block.appendChild(el('div', 'tmo-muted', 'No queued fixture actions for this vessel.'));
    container.appendChild(block);
  }

  function renderVessel(root, hostApi) {
    var vesselName = vesselFromHost(hostApi);
    var vessel = vesselByName(vesselName);
    if (vessel && vessel.name) vesselName = vessel.name;
    var live = { tried: false, enabled: false, state: 'fixture', message: '', items: null };
    var own = itemsForVessel(vesselName);
    var view = { selected: own[0] ? own[0].id : null };
    var canUseHostOps = !!(hostApi && hostApi.operations && typeof hostApi.operations.listOwn === 'function');
    var body = el('div', 'tmo-layout tmo-layout-vessel');
    shell(root, 'My Vessel Outstandings', vesselName + ' - vessel role', 'vessel',
      canUseHostOps ? 'HOST BRIDGE' : 'FIXTURE MODE',
      canUseHostOps
        ? 'Operations calls are host-mediated. If backend/config is unavailable, this view falls back to fixture data without claiming sync.'
        : null);
    var listPane = el('section', 'tmo-list-pane');
    var detailPane = el('section', 'tmo-detail-pane');
    body.appendChild(listPane);
    body.appendChild(detailPane);
    root.appendChild(body);

    function currentOwnItems() {
      return live.enabled && live.items ? live.items : itemsForVessel(vesselName);
    }

    function setLiveItems(serverItems) {
      live.items = [];
      for (var i = 0; i < serverItems.length; i++) live.items.push(mapServerItem(serverItems[i], vesselName));
      live.enabled = true;
      live.state = live.items.length ? 'ok' : 'empty';
      live.message = live.items.length ? 'Server-backed host operations.' : 'No server outstandings for this vessel.';
      if (!view.selected && live.items[0]) view.selected = live.items[0].id;
    }

    function replaceLiveItem(serverItem) {
      var mapped = mapServerItem(serverItem, vesselName);
      var items = live.items || [];
      var replaced = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === mapped.id) {
          items[i] = mapped;
          replaced = true;
          break;
        }
      }
      if (!replaced) items.unshift(mapped);
      live.items = items;
      live.enabled = true;
      live.message = 'Server acknowledged.';
      view.selected = mapped.id;
    }

    function loadHostOperations() {
      if (!canUseHostOps || live.tried) return;
      live.tried = true;
      live.state = 'loading';
      live.message = 'Loading host operations...';
      repaint();
      hostApi.operations.listOwn({ limit: 100 }).then(function (res) {
        if (res && res.ok) {
          setLiveItems(res.items || []);
        } else {
          live.enabled = false;
          live.state = (res && res.state) || 'unavailable';
          live.message = 'Host operations ' + live.state + '. Showing fixture queue.';
        }
        repaint();
      }).catch(function (e) {
        live.enabled = false;
        live.state = 'unavailable';
        live.message = 'Host operations unavailable. Showing fixture queue.';
        repaint();
      });
    }

    function createOwn() {
      if (live.enabled && hostApi.operations && typeof hostApi.operations.createOwn === 'function') {
        live.message = 'Creating item through host...';
        repaint();
        hostApi.operations.createOwn({
          title: 'Vessel-originated defect request',
          description: 'Created by vessel role through the On Board operations host.',
          priority: 'normal',
          department: 'TECH',
          kind: 'technical outstanding'
        }).then(function (res) {
          if (res && res.ok && res.item) replaceLiveItem(res.item);
          else live.message = 'Create failed: ' + ((res && res.state) || 'unavailable');
          repaint();
        }).catch(function () {
          live.message = 'Create failed: unavailable';
          repaint();
        });
        return;
      }
      var item = createVesselItem(vesselName);
      view.selected = item.id;
      repaint();
    }

    function liveHandlers() {
      if (!live.enabled || !hostApi.operations) return null;
      return {
        setStatus: function (item, statusValue) {
          live.message = 'Updating status through host...';
          repaint();
          hostApi.operations.updateOwn(item.id, { status: statusValue }).then(function (res) {
            if (res && res.ok && res.item) replaceLiveItem(res.item);
            else live.message = 'Update failed: ' + ((res && res.state) || 'unavailable');
            repaint();
          }).catch(function () {
            live.message = 'Update failed: unavailable';
            repaint();
          });
        },
        addComment: function (item, text) {
          live.message = 'Adding comment through host...';
          repaint();
          hostApi.operations.comment(item.id, text).then(function (res) {
            live.message = (res && res.ok) ? 'Server acknowledged comment.' : ('Comment failed: ' + ((res && res.state) || 'unavailable'));
            repaint();
          }).catch(function () {
            live.message = 'Comment failed: unavailable';
            repaint();
          });
        }
      };
    }

    function repaint() {
      clear(listPane);
      clear(detailPane);
      own = currentOwnItems();
      if (!view.selected && own[0]) view.selected = own[0].id;
      listPane.appendChild(el('div', 'tmo-section-title', 'Own-vessel queue'));
      if (canUseHostOps) {
        listPane.appendChild(el('div', 'tmo-host-state', live.message || 'Host operations available.'));
      }
      var toolbar = el('div', 'tmo-toolbar');
      toolbar.appendChild(textButton('Create vessel item', 'tmo-button tmo-primary', createOwn));
      listPane.appendChild(toolbar);
      listPane.appendChild(el('div', 'tmo-list-count', String(own.length) + ' ' + (live.enabled ? 'server' : 'fixture') + ' outstandings for ' + vesselName));
      table(listPane, own, view.selected, function (id) { view.selected = id; repaint(); });
      if (live.enabled) {
        var liveNote = el('section', 'tmo-outbox');
        liveNote.appendChild(el('div', 'tmo-section-title', 'Sync'));
        liveNote.appendChild(el('div', 'tmo-muted', 'Server acknowledgement is required before an item is shown as synced.'));
        listPane.appendChild(liveNote);
      } else {
        renderOutbox(listPane, vesselName);
      }

      var selected = live.enabled ? itemByIdIn(own, view.selected) : itemById(view.selected);
      detailPane.appendChild(controlBar(selected, 'vessel', repaint, liveHandlers()));
      detail(detailPane, selected, 'Vessel update');
      detailPane.appendChild(el('div', 'tmo-action-note', live.enabled ? 'Operations are host-mediated. The plugin never receives the vessel token or chooses another vessel.' : 'Attachment and server sync are host-mediated after backend GO. This shell queues only local fixture actions.'));
    }

    repaint();
    loadHostOperations();
    if (hostApi && hostApi.navigation && typeof hostApi.navigation.setTitle === 'function') {
      try { hostApi.navigation.setTitle('My Vessel Outstandings'); } catch (e) {}
    }
  }

  function renderUnknown(root) {
    shell(root, 'Outstandings', 'Unsupported host role', 'unknown');
    root.appendChild(el('div', 'tmo-empty', 'This plugin requires management or onboard host capabilities.'));
  }

  function snapshot(root, role) {
    var visibleItems = [];
    var rows = root.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) visibleItems.push(rows[i].getAttribute('data-id'));
    return {
      role: role,
      text: root.textContent || '',
      tableRows: rows.length,
      visibleItems: visibleItems,
      syncStates: state.items.map(function (item) { return item.syncState; }),
      hasPrintView: !!root.querySelector('.tmo-print-view'),
      hasWarning: !!root.querySelector('.tmo-warning')
    };
  }

  function mount(container, hostApi) {
    if (!container) throw new Error('[transmed-marine-operations] mount requires a container');
    if (current) { try { unmount(); } catch (e) {} }

    var role = resolveRole(hostApi || {});
    var root = el('div', 'tmo tmo-' + (role || 'unknown'));
    clear(container);
    container.appendChild(root);

    if (role === 'management') renderManagement(root, hostApi || {});
    else if (role === 'vessel') renderVessel(root, hostApi || {});
    else renderUnknown(root);

    current = { container: container, role: role, root: root };

    if (typeof window !== 'undefined' && window.__SKIPI_PLUGIN_TEST__) {
      window.SkipiPlugins[KEY].__test = {
        role: role,
        snapshot: function () { return snapshot(root, role); },
        state: state
      };
    }
  }

  function unmount() {
    if (!current) return;
    try { clear(current.container); } catch (e) {}
    current = null;
    if (window.SkipiPlugins && window.SkipiPlugins[KEY]) { try { delete window.SkipiPlugins[KEY].__test; } catch (e) {} }
  }

  window.SkipiPlugins = window.SkipiPlugins || {};
  window.SkipiPlugins[KEY] = { manifest: MANIFEST, mount: mount, unmount: unmount };
})();
