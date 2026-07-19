# On Board — unified @skipi/settings adoption: defect log

Wave: feature/unified-settings-20260719 (base bdc1267 → candidate 3830d8f)
Home: On Board (entity = vessel). Team omitted (fail-closed → «Команда» hidden).

## Shell-level defects
None. Headless validation against the REAL vendored shell (dist/skipi-settings.js
0.3.0) mounts cleanly and produces exactly the expected groups:

- «Общие»: `profile` + `application`
- On Board: `vessel` («Судно»)
- `team` absent (host.team omitted)
- `devices` absent (host.devices omitted)

Escaping, theme-persist (data-theme + localStorage), en/ru i18n and
getSettings/saveSettings round-trip all pass (39/39 checks in the vm harness).

## Deferred / non-blocking notes

1. **Legacy inline settings retained, not retired.**
   `renderSettings()`, `renderSettingsNav()`, `renderPairedDevicesSettings()`,
   the crew roster/connection/workflow/security tabs and the legacy
   `#settings-overlay` remain in `dist/index.html`. The gear now opens the
   UNIFIED shell; the legacy surface is rendered into its (hidden) overlay only
   as a fallback and to keep the existing regression harnesses green
   (`settings_standard_harness.mjs`, `onboard_presence_contract_harness.mjs`
   both assert the legacy structure directly). Per the adoption recipe, retire
   the legacy path only AFTER owner visual-parity sign-off; it is a follow-up,
   not part of this pass.

2. **Crew / roster management is NOT in the unified shell.**
   Crew linking, invite QR and the live roster live in the standalone "Crew"
   module tab and the legacy settings tabs, not in the unified shell (crew is a
   membership/team concept, and team is omitted for On Board). No crew section
   was ported into `appSpecificSections` — only the read-only «Судно» vessel
   section. `crewAfterRosterRender()`'s auto-re-render of the legacy settings
   surface no longer fires while the unified shell is open (it keys off the
   hidden legacy overlay). No functional regression to the Crew module itself.

3. **Devices section omitted (honest).**
   The On Board desktop shell has no real device-pairing backend, so
   `host.devices` is intentionally omitted (NOT provided as an empty Array,
   which the shell would reject). The legacy honest "not connected" devices
   shell continues to own that story until a real capability exists.

4. **getProfile.user.id is a static placeholder** (`'onboard-local'`).
   On Board has no per-user identity in this local shell; the required
   `user.id` field is filled with a stable local placeholder. The entity
   (vessel) is the meaningful part and is sourced from
   `localStorage['skipi-onboard-crew-config']`.

5. **Updater-artifact signing skipped for the local smoke build.**
   `tauri.conf.json` has `createUpdaterArtifacts: true`, which needs
   `TAURI_SIGNING_PRIVATE_KEY`. The deb and AppImage bundles are produced
   BEFORE that signing step; only the (unneeded) updater `.sig` fails. This is
   a local smoke build, not a release — no config change made.
