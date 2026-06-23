# Skipi On Board

**Skipi - United Seafarers.** The vessel-side home of the **Skipi** family
(alongside Skipi Seafarer, Crewing, Broker, Management).

## Current slice — three-module desktop shell (2026-06-23)

A calm, light-theme desktop shell in the visual family of Skipi Seafarer, with a
top modules-bar of three base modules:

- **Crew** — the people linked to this vessel + the QR **pairing** flow (default
  screen). Crew scan a one-time, expiring QR from Skipi Seafarer to connect their
  device. Placeholder stat cards (total crew / paired devices / pending invites /
  recent onboarding) and a "No linked crew yet" empty state. The invite is a real
  structured payload v1; the QR is generated fully offline (vendored encoder).
- **Apps** — the onboard applications/plugins registry (list + detail). A
  local/static shelf of official onboard tools, each *Coming soon* with a detail
  screen explaining its future role.
- **Vessel Documents** — a scaffold preview of the ship's document vault
  (Certificates · Manuals · Safety Management · Checklists/Forms · Cargo/Voyage
  docs), all *Coming soon*.

Constraints: desktop / Linux only; light theme, petrol accent `#004564`;
**no server, no account, no personal data, no marketplace, no third-party
runtime, no real crew DB, no real document vault**. QR contains no PII and gives
On Board no access to a seafarer's vault.

Apps seed tiles: Watch Schedule · Announcements · Checklists · Familiarization ·
Photo Reports · Safety Reports · BNWAS / Time Anchor · Distance Tables · Draft Survey.

QR encoder is vendored locally (offline, no CDN) — see `dist/vendor/README.md`.

UI reference (read-only): `../skipi-public` (Skipi Seafarer Apps host).

## Plugin host (Apps module) — readiness H0–H3

The **Apps** module is the plugin host surface. On Board hosts **reviewed,
bundled first-party plugins** only — no marketplace, no remote code loading, no
unsigned auto-update. Plugin internals are built/tested in the plugin lab; the
home only registers a tile, manages local Install/Open/Disable state, mounts the
plugin, and hands it a **narrow host API**.

- Bundled artifacts live in `dist/plugins/<plugin-id>/` (`plugin.json`,
  `index.js`, `index.css`, `checksums.json`, `CHANGELOG.md`, `REPORT.md`),
  loaded at boot; each self-registers into `window.SkipiPlugins`.
- Tile states: **Available / Installed / Disabled / Coming soon**. Install state
  is local (`localStorage` `skipi-onboard-plugins`).
- Host API given to a mounted plugin: `theme.get/subscribe`,
  `storage.get/set/remove` (namespaced per plugin), `audio.playLoop/stop`
  (no-op until a native bridge), `navigation.closePlugin/setTitle`,
  `permissions.listGranted`.
- Bundled demo fixture: `dist/plugins/onboard-host-check/` — verifies the host
  contract only (not a product plugin).

**Forbidden to plugins by default** (no host API exposes them): crew list,
paired-device identities, vessel documents, vessel certificates, QR pairing
secrets/challenges, admin/owner data, central-repository write, network. Any
plugin needing vessel-doc / crew / pairing / report-submit access requires
explicit permission and a separate review (host readiness level H4, not in this
pass). QR pairing is a trust bootstrap, **not** a cryptographically secure
plugin-authorization layer.

## Future onboard role (background, not this slice)

The full On Board product is the ship's Skipi home: vessel info, watch schedule,
announcements, onboard checklists, familiarization, photo/safety/defect/incident
reports, and a QR-paired link to **Skipi Seafarer** that pushes structured
signals into the central Skipi core — without exposing the seafarer's personal
vault. The original **Job Reporter** skeleton (work-completion photo reports to
the office via `skipi-server`) is preserved in git history (baseline commit) and
returns later as the **Photo Reports** onboard module. Shore counterpart:
**Skipi Ship Management** (`../skipi-shipmgmt`).

Refs (Obsidian vault `Test`): `Skipi Onboard — продукт`,
`Skipi Applications — приложения в домах Skipi`,
`Skipi Device Pairing — QR sync and Onboard exchange`,
`Объединённые моряки — платформа Skipi — опорный файл`,
`Скипи На борту — Linux — контекстное окно`.

## Stack

Tauri v2 shell (Rust) + single-file `dist/index.html` frontend. The shell is a
thin Tauri builder with no custom Rust commands yet (the Apps shell is pure
frontend; no `invoke`, no `fetch`). Commands return when offline `.eml`
packaging / device pairing land.

## Run / build

```bash
cd src-tauri
cargo check               # type-check the Rust shell
cargo tauri dev           # desktop dev
cargo tauri build         # desktop bundle
```

## Status

Three-module desktop shell — Crew / Apps / Vessel Documents (2026-06-23). Static
preview, no backend. QR pairing is Stage 1 (On Board is the QR issuer; the
Seafarer scanner is a separate later stage). TODO: real crew/device linking,
live onboard modules, document vault, per-app runtimes.
