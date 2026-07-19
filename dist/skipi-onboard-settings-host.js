/* Skipi On Board — thin host adapter for the vendored @skipi/settings shell.
 *
 * The On Board frontend is a single hand-authored dist/index.html (vanilla JS,
 * no bundler). Before this file there was NO settings I/O, NO theme persistence,
 * NO i18n at all — the only native bridge is the get_build_info Tauri command.
 * So every adapter here is built from scratch over localStorage:
 *
 *   getSettings / saveSettings  — one JSON blob under LS_SETTINGS
 *   applyTheme                  — sets <html data-theme> AND persists to LS_THEME
 *   getUiLang / setUiLang       — LS_LANG ('en' | 'ru')
 *   t(key, ...args)             — minimal lookup over the ported settings.* catalog
 *
 * Optional getProfile() surfaces the vessel entity from the existing
 * localStorage['skipi-onboard-crew-config'] blob. Team is intentionally OMITTED
 * (no host.team) — «Команда» stays hidden, fail-closed. devices is omitted too
 * (this desktop shell has no real device-pairing backend; the legacy honest
 * shell continues to own that story until a real capability exists).
 *
 * An On Board «Судно» app-specific section renders vessel data; ALL dynamic
 * values are escaped through ctx.escapeHtml / ctx.escapeAttr at the raw-HTML
 * boundary.
 *
 * Provenance of the vendored shell: skipi-settings 9caeff6, @skipi/settings 0.3.0.
 */
(function () {
  'use strict';

  var LS_SETTINGS = 'skipi-onboard-settings';
  var LS_THEME = 'skipi-onboard-theme';
  var LS_LANG = 'skipi-onboard-ui-lang';
  var CREW_CONFIG_KEY = 'skipi-onboard-crew-config';

  // ---- ported settings.* dictionary (en + ru) — from skipi-settings harness/mock-host.js
  var SETTINGS_I18N = {
 en: {"settings.title":"Settings",
"settings.subtitle":"Manage this app and its local data.",
"settings.loading":"Loading settings…",
"settings.value.unavailable":"Unavailable",
"settings.section.profile":"Profile",
"settings.section.profile.description":"User, represented entity, identity and recovery.",
"settings.section.team":"Team",
"settings.section.team.description":"Team profile, roles, members and invitations.",
"settings.section.application":"Application",
"settings.section.application.description":"Theme, language, storage, modules and app details.",
"settings.section.modules":"Modules",
"settings.section.modules.description":"Extensions supplied by the module host.",
"settings.section.identity":"Identity & access",
"settings.section.identity.description":"Local identity, trust and recovery.",
"settings.section.storage":"Storage",
"settings.section.storage.description":"Local data location and backups.",
"settings.section.devices":"Devices",
"settings.section.devices.description":"Pair and manage trusted devices.",
"settings.section.appearance":"Appearance",
"settings.section.appearance.description":"Theme and interface language.",
"settings.section.about":"About",
"settings.section.about.description":"Application details and support.",
"settings.group.application":"Application",
"settings.group.account":"Account and data",
"settings.group.preferences":"Theme and language",
"settings.group.information":"Information",
"settings.group.general":"General",
"settings.group.team":"Team",
"settings.group.home_settings":"Home settings",
"settings.profile.user.title":"User",
"settings.profile.user.id":"Unique ID",
"settings.profile.user.id.description":"Stable identifier supplied by this home.",
"settings.profile.user.email":"Email",
"settings.profile.user.phone":"Phone",
"settings.profile.team_role":"Role in team",
"settings.profile.team_role.description":"Membership is managed in Team.",
"settings.profile.entity.title":"Represented entity",
"settings.profile.entity.type":"Type",
"settings.profile.entity.type.person":"Person",
"settings.profile.entity.type.company":"Company",
"settings.profile.entity.type.vessel":"Vessel",
"settings.profile.entity.name":"Name",
"settings.profile.entity.jurisdiction":"Jurisdiction",
"settings.profile.entity.verified_level":"Verification level",
"settings.profile.entity.imo":"IMO number",
"settings.team.profile.title":"Team profile",
"settings.team.name":"Name",
"settings.team.reply_to":"Reply-to email",
"settings.team.server_status":"Server status",
"settings.team.save":"Team profile",
"settings.team.save.description":"Administrators can update shared team details.",
"settings.team.role.title":"Membership",
"settings.team.current_role":"Current role",
"settings.team.role.administrator":"Administrator",
"settings.team.role.member":"Member",
"settings.team.members.title":"Members",
"settings.team.members.empty":"No team members.",
"settings.team.invite":"Invite a member",
"settings.team.invite.description":"Send access through an administrator invitation.",
"settings.team.invite.placeholder":"member@example.com",
"settings.team.join.title":"Join a team",
"settings.team.join":"Invitation",
"settings.team.join.description":"Use the invitation received from an administrator.",
"settings.team.join.placeholder":"Invitation code",
"settings.modules.title":"Installed modules",
"settings.modules.mount_label":"Module manager",
"settings.modules.mount_description":"This surface is mounted and cleaned up by the host.",
"settings.modules.mount_error":"The module manager could not be mounted.",
"settings.modules.unavailable":"Module management is not available.",
"settings.identity.access_title":"Access",
"settings.identity.key":"Identity key",
"settings.identity.key.description":"A fake public fingerprint supplied asynchronously by the host.",
"settings.identity.trust":"Trust status",
"settings.identity.trust.description":"The host remains responsible for trust decisions.",
"settings.identity.connection":"Connection",
"settings.identity.connection.description":"Connection state reported by the host identity capability.",
"settings.identity.connected":"Connected",
"settings.identity.not_connected":"Not connected",
"settings.identity.refresh":"Refresh status",
"settings.identity.refresh.description":"Read identity and trust again from the host.",
"settings.identity.recovery_title":"Recovery",
"settings.identity.recovery.bind":"Bind recovery",
"settings.identity.recovery.bind.description":"Attach a simulated recovery method.",
"settings.identity.recovery.recover":"Recover identity",
"settings.identity.recovery.recover.description":"Run a simulated recovery operation.",
"settings.storage.vault_title":"Local storage",
"settings.storage.location":"Data location",
"settings.storage.location.description":"Resolved by the host storage capability.",
"settings.storage.export":"Export backup",
"settings.storage.export.description":"Create a JSON snapshot of the mock state.",
"settings.storage.import":"Import backup",
"settings.storage.import.description":"Restore the latest exported snapshot.",
"settings.devices.title":"Trusted devices",
"settings.devices.unnamed":"Unnamed device",
"settings.devices.current":"Current",
"settings.devices.empty":"No paired devices.",
"settings.devices.add":"Add a device",
"settings.devices.add.description":"Pair a new device or scan for one nearby.",
"settings.devices.one_time_code":"One-time code",
"settings.devices.one_time_code.description":"Use this short-lived code on the device being connected.",
"settings.appearance.title":"Interface",
"settings.appearance.theme":"Theme",
"settings.appearance.theme.description":"Applied and persisted by the mock host.",
"settings.appearance.language":"Language",
"settings.appearance.language.description":"Switch the host translation dictionary.",
"settings.theme.light":"Light",
"settings.theme.dark":"Dark",
"settings.language.en":"English",
"settings.language.ru":"Русский",
"settings.about.title":"Application",
"settings.about.app_name":"Name",
"settings.about.version":"Version",
"settings.about.support":"Support",
"settings.about.website":"Website",
"settings.about.legal":"Legal",
"settings.action.back":"Back",
"settings.action.save":"Save",
"settings.action.bind":"Bind",
"settings.action.close":"Close",
"settings.action.export":"Export",
"settings.action.import":"Import",
"settings.action.pair":"Pair device",
"settings.action.recover":"Recover",
"settings.action.refresh":"Refresh",
"settings.action.retry":"Retry",
"settings.action.revoke":"Revoke",
"settings.action.scan":"Scan",
"settings.action.create_code":"Create one-time code",
"settings.action.open_team":"Open Team",
"settings.action.invite":"Invite",
"settings.action.remove":"Remove",
"settings.action.join":"Join",
"settings.notice.saved":"Settings saved.",
"settings.notice.theme_applied":"Theme applied.",
"settings.notice.language_applied":"Language changed.",
"settings.notice.exported":"Backup exported.",
"settings.notice.imported":"Backup imported.",
"settings.notice.recovery_bound":"Recovery method bound.",
"settings.notice.recovered":"Identity recovered.",
"settings.notice.device_paired":"Device list updated.",
"settings.notice.device_scanned":"Nearby devices scanned.",
"settings.notice.device_revoked":"Device revoked.",
"settings.notice.device_code_created":"One-time device code created.",
"settings.notice.team_saved":"Team profile saved.",
"settings.notice.team_invited":"Invitation sent.",
"settings.notice.team_removed":"Member removed.",
"settings.notice.team_joined":"Team joined.",
"settings.error.action_failed":"The action failed. See the harness log.",
"settings.error.capability_failed":"This status could not be loaded. Retry to read it again.",
"settings.error.load_failed":"Settings could not be loaded.",
"settings.error.refresh_failed":"Settings could not be refreshed.",
"settings.error.section_failed":"This injected section failed to render.",
"settings.error.section_missing":"The requested section does not exist."},
 ru: {"settings.title":"Настройки",
"settings.subtitle":"Управление приложением и локальными данными.",
"settings.loading":"Загрузка настроек…",
"settings.value.unavailable":"Недоступно",
"settings.section.profile":"Профиль",
"settings.section.profile.description":"Пользователь, представляемая сущность, идентичность и восстановление.",
"settings.section.team":"Команда",
"settings.section.team.description":"Профиль команды, роли, участники и приглашения.",
"settings.section.application":"Приложение",
"settings.section.application.description":"Тема, язык, хранилище, модули и сведения о приложении.",
"settings.section.modules":"Модули",
"settings.section.modules.description":"Расширения, предоставленные хостом модулей.",
"settings.section.identity":"Идентичность и доступ",
"settings.section.identity.description":"Локальная идентичность, доверие и восстановление.",
"settings.section.storage":"Хранилище",
"settings.section.storage.description":"Расположение локальных данных и резервные копии.",
"settings.section.devices":"Устройства",
"settings.section.devices.description":"Подключение и управление доверенными устройствами.",
"settings.section.appearance":"Оформление",
"settings.section.appearance.description":"Тема и язык интерфейса.",
"settings.section.about":"О приложении",
"settings.section.about.description":"Сведения о приложении и поддержке.",
"settings.group.application":"Приложение",
"settings.group.account":"Учётная запись и данные",
"settings.group.preferences":"Тема и язык",
"settings.group.information":"Информация",
"settings.group.general":"Общие",
"settings.group.team":"Команда",
"settings.group.home_settings":"Настройки дома",
"settings.profile.user.title":"Пользователь",
"settings.profile.user.id":"Уникальный ID",
"settings.profile.user.id.description":"Постоянный идентификатор, предоставленный домом.",
"settings.profile.user.email":"Электронная почта",
"settings.profile.user.phone":"Телефон",
"settings.profile.team_role":"Роль в команде",
"settings.profile.team_role.description":"Членство управляется в разделе «Команда».",
"settings.profile.entity.title":"Представляемая сущность",
"settings.profile.entity.type":"Тип",
"settings.profile.entity.type.person":"Человек",
"settings.profile.entity.type.company":"Компания",
"settings.profile.entity.type.vessel":"Судно",
"settings.profile.entity.name":"Название",
"settings.profile.entity.jurisdiction":"Юрисдикция",
"settings.profile.entity.verified_level":"Уровень проверки",
"settings.profile.entity.imo":"Номер IMO",
"settings.team.profile.title":"Профиль команды",
"settings.team.name":"Название",
"settings.team.reply_to":"Почта для ответов",
"settings.team.server_status":"Статус сервера",
"settings.team.save":"Профиль команды",
"settings.team.save.description":"Администраторы могут изменять общие данные команды.",
"settings.team.role.title":"Членство",
"settings.team.current_role":"Текущая роль",
"settings.team.role.administrator":"Администратор",
"settings.team.role.member":"Участник",
"settings.team.members.title":"Участники",
"settings.team.members.empty":"В команде нет участников.",
"settings.team.invite":"Пригласить участника",
"settings.team.invite.description":"Администратор предоставляет доступ через приглашение.",
"settings.team.invite.placeholder":"member@example.com",
"settings.team.join.title":"Вступить в команду",
"settings.team.join":"Приглашение",
"settings.team.join.description":"Используйте приглашение, полученное от администратора.",
"settings.team.join.placeholder":"Код приглашения",
"settings.modules.title":"Установленные модули",
"settings.modules.mount_label":"Менеджер модулей",
"settings.modules.mount_description":"Эту область монтирует и очищает хост.",
"settings.modules.mount_error":"Не удалось смонтировать менеджер модулей.",
"settings.modules.unavailable":"Управление модулями недоступно.",
"settings.identity.access_title":"Доступ",
"settings.identity.key":"Ключ идентичности",
"settings.identity.key.description":"Тестовый публичный отпечаток, асинхронно полученный от хоста.",
"settings.identity.trust":"Статус доверия",
"settings.identity.trust.description":"Решения о доверии остаются ответственностью хоста.",
"settings.identity.connection":"Подключение",
"settings.identity.connection.description":"Состояние подключения от host-возможности идентичности.",
"settings.identity.connected":"Подключено",
"settings.identity.not_connected":"Не подключено",
"settings.identity.refresh":"Обновить статус",
"settings.identity.refresh.description":"Повторно получить идентичность и доверие от хоста.",
"settings.identity.recovery_title":"Восстановление",
"settings.identity.recovery.bind":"Привязать восстановление",
"settings.identity.recovery.bind.description":"Подключить тестовый способ восстановления.",
"settings.identity.recovery.recover":"Восстановить идентичность",
"settings.identity.recovery.recover.description":"Запустить тестовую операцию восстановления.",
"settings.storage.vault_title":"Локальное хранилище",
"settings.storage.location":"Расположение данных",
"settings.storage.location.description":"Определяется storage-возможностью хоста.",
"settings.storage.export":"Экспорт копии",
"settings.storage.export.description":"Создать JSON-снимок тестового состояния.",
"settings.storage.import":"Импорт копии",
"settings.storage.import.description":"Восстановить последний экспортированный снимок.",
"settings.devices.title":"Доверенные устройства",
"settings.devices.unnamed":"Устройство без имени",
"settings.devices.current":"Текущее",
"settings.devices.empty":"Нет подключённых устройств.",
"settings.devices.add":"Добавить устройство",
"settings.devices.add.description":"Подключить новое устройство или найти находящееся рядом.",
"settings.devices.one_time_code":"Одноразовый код",
"settings.devices.one_time_code.description":"Введите этот короткоживущий код на подключаемом устройстве.",
"settings.appearance.title":"Интерфейс",
"settings.appearance.theme":"Тема",
"settings.appearance.theme.description":"Применяется и сохраняется тестовым хостом.",
"settings.appearance.language":"Язык",
"settings.appearance.language.description":"Переключает словарь переводов хоста.",
"settings.theme.light":"Светлая",
"settings.theme.dark":"Тёмная",
"settings.language.en":"English",
"settings.language.ru":"Русский",
"settings.about.title":"Приложение",
"settings.about.app_name":"Название",
"settings.about.version":"Версия",
"settings.about.support":"Поддержка",
"settings.about.website":"Сайт",
"settings.about.legal":"Правовая информация",
"settings.action.back":"Назад",
"settings.action.save":"Сохранить",
"settings.action.bind":"Привязать",
"settings.action.close":"Закрыть",
"settings.action.export":"Экспортировать",
"settings.action.import":"Импортировать",
"settings.action.pair":"Подключить",
"settings.action.recover":"Восстановить",
"settings.action.refresh":"Обновить",
"settings.action.retry":"Повторить",
"settings.action.revoke":"Отозвать",
"settings.action.scan":"Сканировать",
"settings.action.create_code":"Создать одноразовый код",
"settings.action.open_team":"Открыть «Команду»",
"settings.action.invite":"Пригласить",
"settings.action.remove":"Удалить",
"settings.action.join":"Вступить",
"settings.notice.saved":"Настройки сохранены.",
"settings.notice.theme_applied":"Тема применена.",
"settings.notice.language_applied":"Язык изменён.",
"settings.notice.exported":"Резервная копия экспортирована.",
"settings.notice.imported":"Резервная копия импортирована.",
"settings.notice.recovery_bound":"Способ восстановления привязан.",
"settings.notice.recovered":"Идентичность восстановлена.",
"settings.notice.device_paired":"Список устройств обновлён.",
"settings.notice.device_scanned":"Поиск устройств поблизости завершён.",
"settings.notice.device_revoked":"Доступ устройства отозван.",
"settings.notice.device_code_created":"Одноразовый код устройства создан.",
"settings.notice.team_saved":"Профиль команды сохранён.",
"settings.notice.team_invited":"Приглашение отправлено.",
"settings.notice.team_removed":"Участник удалён.",
"settings.notice.team_joined":"Вступление в команду выполнено.",
"settings.error.action_failed":"Действие не выполнено. Подробности в журнале.",
"settings.error.capability_failed":"Не удалось загрузить этот статус. Повторите чтение.",
"settings.error.load_failed":"Не удалось загрузить настройки.",
"settings.error.refresh_failed":"Не удалось обновить настройки.",
"settings.error.section_failed":"Ошибка отрисовки внедрённого раздела.",
"settings.error.section_missing":"Запрошенный раздел не существует."}
};

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function normLang(v) { return v === 'ru' ? 'ru' : 'en'; }
  function normTheme(v) { return v === 'dark' ? 'dark' : 'light'; }

  function readUiLang() { return normLang(lsGet(LS_LANG)); }
  function readTheme() { return normTheme(lsGet(LS_THEME)); }

  // t(key, ...args): dictionary lookup with %s / {0} substitution. Synchronous
  // (the shell requires host.t to be synchronous). Unknown key => key itself.
  function translate(key) {
    var lang = readUiLang();
    var dict = SETTINGS_I18N[lang] || SETTINGS_I18N.en;
    var out = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key]
            : (Object.prototype.hasOwnProperty.call(SETTINGS_I18N.en, key) ? SETTINGS_I18N.en[key] : key);
    if (arguments.length > 1) {
      var args = Array.prototype.slice.call(arguments, 1);
      var i = 0;
      out = String(out).replace(/%s|\{(\d+)\}/g, function (m, idx) {
        var pick = idx != null ? args[Number(idx)] : args[i++];
        return pick == null ? '' : String(pick);
      });
    }
    return out;
  }

  // Read the vessel profile blob written by the existing On Board flows.
  function crewConfig() {
    try { return JSON.parse(lsGet(CREW_CONFIG_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function readSettings() {
    var raw = lsGet(LS_SETTINGS);
    var obj = {};
    if (raw) { try { var parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed; } catch (e) {} }
    // Keep appearance in sync with the dedicated theme/lang keys so the shell's
    // appearance section reflects the persisted values on first paint.
    if (!obj.appearance || typeof obj.appearance !== 'object') obj.appearance = {};
    obj.appearance.theme = readTheme();
    obj.appearance.language = readUiLang();
    return obj;
  }

  function writeSettings(next) {
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new TypeError('saveSettings expects an object');
    }
    lsSet(LS_SETTINGS, JSON.stringify(next));
    // Mirror appearance choices into the dedicated persistence keys.
    if (next.appearance && typeof next.appearance === 'object') {
      if (next.appearance.theme != null) applyTheme(next.appearance.theme);
      if (next.appearance.language != null) lsSet(LS_LANG, normLang(next.appearance.language));
    }
    return next;
  }

  // applyTheme: apply to the document AND persist. This is the single source of
  // truth for On Board theming (there was none before this file).
  function applyTheme(theme) {
    theme = normTheme(theme);
    try { document.documentElement.setAttribute('data-theme', theme); } catch (e) {}
    lsSet(LS_THEME, theme);
    return theme;
  }

  // ---- On Board «Судно» app-specific section (vessel data) ----
  // renderHtml receives ctx with escapeHtml/escapeAttr/t. Every dynamic value
  // crosses the raw-HTML boundary escaped.
  function renderVesselSection(ctx) {
    var esc = ctx.escapeHtml;
    var c = crewConfig();
    var lang = readUiLang();
    var L = {
      title: lang === 'ru' ? 'Судно' : 'Vessel',
      current: lang === 'ru' ? 'Текущее судно' : 'Current vessel',
      name: lang === 'ru' ? 'Название' : 'Name',
      imo: lang === 'ru' ? 'Номер IMO' : 'IMO number',
      type: lang === 'ru' ? 'Тип' : 'Type',
      flag: lang === 'ru' ? 'Флаг' : 'Flag',
      mode: lang === 'ru' ? 'Режим' : 'Mode',
      none: lang === 'ru' ? 'Судно не выбрано' : 'No vessel selected',
      none_hint: lang === 'ru'
        ? 'Выберите судно в модуле «My Vessel». Данные судна берутся из локального рабочего контекста.'
        : 'Pick a vessel in the “My Vessel” module. Vessel data comes from the local work context.',
      readonly: lang === 'ru'
        ? 'Данные судна только для чтения в этом разделе.'
        : 'Vessel data is read-only in this section.'
    };

    function row(label, value) {
      return '<div class="skipi-settings__row">'
        + '<div class="skipi-settings__row-main">'
        + '<div class="skipi-settings__row-label">' + esc(label) + '</div>'
        + '</div>'
        + '<div class="skipi-settings__row-control"><code class="skipi-settings__code">' + esc(value) + '</code></div>'
        + '</div>';
    }

    var body;
    if (c.vessel_imo || c.vessel_name) {
      var rows = row(L.name, c.vessel_name || ('IMO ' + (c.vessel_imo || '')))
        + row(L.imo, c.vessel_imo || '—');
      if (c.vessel_type) rows += row(L.type, c.vessel_type);
      if (c.vessel_flag) rows += row(L.flag, c.vessel_flag);
      rows += row(L.mode, c.vessel_mode || 'selected');
      body = rows
        + '<div class="skipi-settings__row-description">' + esc(L.readonly) + '</div>';
    } else {
      body = '<div class="skipi-settings__row-description">' + esc(L.none) + '</div>'
        + '<div class="skipi-settings__row-description">' + esc(L.none_hint) + '</div>';
    }

    return '<section class="skipi-settings__group" data-qa="onboard-unified-vessel-section">'
      + '<h3 class="skipi-settings__group-title">' + esc(L.current) + '</h3>'
      + '<div class="skipi-settings__group-body">' + body + '</div>'
      + '</section>';
  }

  function buildHost() {
    var lang = readUiLang();
    return {
      appName: 'Skipi On Board',
      appVersion: (typeof window !== 'undefined' && window.__ONBOARD_SETTINGS_VERSION__) || '0.3.0',
      about: {
        description: 'Skipi On Board — vessel-side workspace of the Skipi family.',
        support: 'local',
        website: 'skipi.app',
        legal: 'Copyright © 2026 Tymur Rudov'
      },
      languages: [
        { value: 'en', labelKey: 'settings.language.en' },
        { value: 'ru', labelKey: 'settings.language.ru' }
      ],

      // --- 6 required adapter methods ---
      getSettings: function () { return readSettings(); },
      saveSettings: function (next) { return writeSettings(next); },
      applyTheme: function (theme) { return applyTheme(theme); },
      getUiLang: function () { return readUiLang(); },
      setUiLang: function (next) { var v = normLang(next); lsSet(LS_LANG, v); return v; },
      t: function (key) { return translate.apply(null, arguments); },

      // --- optional profile: vessel entity, NO team ---
      getProfile: function () {
        var c = crewConfig();
        var entity = { type: 'vessel' };
        var name = c.vessel_name || (c.vessel_imo ? ('IMO ' + c.vessel_imo) : '');
        if (name) entity.name = String(name);
        if (c.vessel_imo) entity.imo = String(c.vessel_imo);
        return {
          user: { id: 'onboard-local' },
          entity: entity
        };
      },

      // devices deliberately OMITTED (no real pairing backend in this shell).
      // team deliberately OMITTED (fail-closed): «Команда» stays hidden.

      appSpecificSections: [
        {
          id: 'vessel',
          order: 700,
          icon: '▣',
          label: lang === 'ru' ? 'Судно' : 'Vessel',
          description: lang === 'ru' ? 'Данные судна (только чтение).' : 'Vessel data (read-only).',
          renderHtml: renderVesselSection,
          handlers: {}
        }
      ]
    };
  }

  var activeInstance = null;

  // Fresh instance per open; unmount on close. Fail-closed if mount is missing.
  function openUnifiedSettings() {
    var overlay = document.getElementById('unified-settings-overlay');
    var root = document.getElementById('settings-root');
    if (!overlay || !root) return false;
    if (!(window.SkipiSettings && typeof window.SkipiSettings.mount === 'function')) {
      return false; // caller falls back to the legacy settings surface
    }
    closeUnifiedSettings(); // ensure no stale instance
    root.innerHTML = '';
    try {
      activeInstance = window.SkipiSettings.mount(root, buildHost(), {
        mode: 'desktop',
        initialSection: 'profile',
        // The shell renders its own close control when onClose is a function.
        // Route it back through the app's canonical close path.
        onClose: function () {
          try { if (typeof window.closeSettings === 'function') { window.closeSettings(); return; } } catch (e) {}
          closeUnifiedSettings();
        }
      });
    } catch (e) {
      activeInstance = null;
      return false;
    }
    overlay.classList.add('open');
    return true;
  }

  function closeUnifiedSettings() {
    var overlay = document.getElementById('unified-settings-overlay');
    if (activeInstance && typeof activeInstance.unmount === 'function') {
      try { activeInstance.unmount(); } catch (e) {}
    }
    activeInstance = null;
    if (overlay) overlay.classList.remove('open');
    var root = document.getElementById('settings-root');
    if (root) root.innerHTML = '';
  }

  window.OnboardUnifiedSettings = {
    open: openUnifiedSettings,
    close: closeUnifiedSettings,
    isOpen: function () { return !!activeInstance; },
    // exposed for verification/tests
    _t: translate,
    _host: buildHost
  };
})();
