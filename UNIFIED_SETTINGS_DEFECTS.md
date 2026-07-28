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

4. **[CLOSED 2026-07-28] getProfile.user.id is a static placeholder** (`'onboard-local'`).
   Fixed in phase 2 (see below): user.id is now a real persisted install-ID.

5. **Updater-artifact signing skipped for the local smoke build.**
   `tauri.conf.json` has `createUpdaterArtifacts: true`, which needs
   `TAURI_SIGNING_PRIVATE_KEY`. The deb and AppImage bundles are produced
   BEFORE that signing step; only the (unneeded) updater `.sig` fails. This is
   a local smoke build, not a release — no config change made.

## Phase 2 (2026-07-28, wave 5×2 adoption) — live-confirmed defects CLOSED

All four live-confirmed adoption defects are fixed in
`dist/skipi-onboard-settings-host.js`, with failing-first coverage in
`tests/settings_standard_harness.mjs` (RED on candidate bytes 9102071:
10 targeted failures → GREEN after the fixes; legacy sections stayed GREEN):

1. **[CLOSED] mount mode hardcoded to `'desktop'`** → `mode: 'auto'`,
   `breakpoint: 720`: Android gets the responsive mobile layout, not a
   shrunken desktop.
2. **[CLOSED] `getProfile.user.id` placeholder `'onboard-local'`** → real
   install identity. On Board has NO per-user identity subsystem (the only
   native command is `get_build_info`; crew-config carries a vessel-scoped
   raw token, not a user), so the honest minimum is a stable install-ID:
   generated once via WebCrypto UUID (`OB-<uuid>`), persisted under
   `localStorage['skipi-onboard-install-id']`. Profile email comes from the
   persistent settings blob (`profile.email`), user-editable in the new
   «Учётная запись» app-specific section — no fake default.
3. **[CLOSED] `getAccountSummary` missing** (mobile header rendered a bare
   fallback) → minimal host method from real state only: displayName = the
   selected vessel from crew-config (fallback: app name), subtitle = the
   user-set profile email.
4. **[CLOSED] Android system Back backgrounded the app** → history-marker
   pattern (per seafarer b888bf62): `pushState({skipiUnifiedSettings:true})`
   on open, popstate closes through the app's canonical `closeSettings()`
   path, every other close consumes the marker with exactly one
   `history.back()`.

Light theme remains the default (guarded by a fresh-install harness check).

## Desktop VISUAL smoke — BLOCKED (shared X11 resource)

The scripted desktop screenshot could NOT be captured. Not a build defect:
the shared `/tmp/skipi-x11.lock` (protocol-mandated for DISPLAY=:1 grabs) was
held continuously by a PARALLEL home-unification wave — `skipi-crewing`
(pid 3750737) left its app running under the flock for 30+ minutes. My
`flock -w 1200` waiter queued the full 20-minute window (22:27–22:50) and
never got a turn. Per boundaries I did NOT touch the sibling wave's process.

What IS verified for the desktop artifact (FACT, non-visual):
- deb + AppImage bundled successfully from this worktree's dist.
- The built `target/release/skipi-onboard` binary embeds all 5 unified assets
  in its Tauri asset manifest: `/index.html`, `/skipi-settings.js`,
  `/skipi-settings.css`, `/skipi-onboard-settings-host.js`, `/SETTINGS_VERSION`
  (asset contents are brotli-compressed inside the binary; manifest keys grep
  cleanly). Binary mtime (22:13) is after the dist edits (22:06) → build picked
  up the changes.
- In an earlier probe the SAME binary launched on DISPLAY=:1 and created a
  "Skipi On Board" X11 window (webview child pid), so the app runs; only the
  scripted gear-click + ffmpeg grab is unfinished, gated on the lock.
- Headless mount of the REAL vendored shell against the real host adapter
  passes 39/39 (groups «Общие»+«Судно», team/devices absent, escaping,
  theme-persist, en/ru i18n). This substitutes for pixel confirmation of the
  shell CONTRACT, but is NOT a pixel screenshot.

Owner-GO needs: a free X11 turn to capture `desktop.png` (open Settings, verify
«Общие» + «Судно» render), OR accept the headless-verified contract + embedded-
asset proof for this pass.

## Android — best-effort, RAN on emulator-5554 (FACT)

Contrary to the prompt's assumption, this home initialised and built cleanly:
- `cargo tauri android init` succeeded (NDK 27.0.12077973).
- `cargo tauri android build --apk --debug --target x86_64` produced a universal
  debug APK containing `lib/x86_64/libapp_lib.so`.
  Path: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
  sha256 `0ff026f1f1b473113588a9dcc0e0ac2b7a11e12a0e780ac5ad60420f1f3c1ae8`.
- Smoke on `emulator-5554` ONLY (physical `29191FDH2007CD` never touched):
  `adb -s emulator-5554 install -r` → Success; launcher intent injected;
  `screencap` → `/tmp/skipi-wave-onboard/mobile.png` (250 KB). The app launches
  and renders the On Board launch screen («Судовой рабочий стол» / «Открыть
  Skipi On Board»). Settings/the gear live inside the shell (after entering a
  vessel), so the unified-shell screen itself was not reached in this quick
  launcher smoke — but install+launch+render are confirmed FACT.
- `src-tauri/gen/android/` is git-ignored (`.gitignore: /src-tauri/gen/`) — the
  generated Android project is intentionally NOT committed, matching repo policy.
