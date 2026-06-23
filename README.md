# Skipi On Board

**Skipi - United Seafarers.** The vessel-side home of the **Skipi** family
(alongside Skipi Seafarer, Crewing, Broker, Management).

## Current slice — Apps-only desktop shell (2026-06-23)

The first desktop slice is an **Apps home**: a calm, light-theme shell in the
visual family of Skipi Seafarer, with a single module — **Apps**. It is a
local/static registry of official onboard tools shown as a tile shelf, the seed
of the future Skipi applications/plugins layer.

- desktop / Linux only;
- light theme by default, petrol accent `#004564`, top modules-bar;
- one module: **Apps**, as the first screen (not a landing page);
- **no server, no account, no personal data, no marketplace, no third-party runtime**;
- each tile is *Coming soon* with a detail screen explaining its future onboard role.

Seed tiles: Watch Schedule · Announcements · Checklists · Familiarization ·
Photo Reports · Safety Reports · BNWAS / Time Anchor · Distance Tables · Draft Survey.

UI reference (read-only): `../skipi-public` (Skipi Seafarer Apps host).

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

Apps-only desktop MVP shell (2026-06-23). Static preview, no backend. TODO:
device pairing (QR), live onboard modules, then per-app runtimes.
