# Skipi On Board

**Skipi - United Seafarers.** Vessel-side app of the **Skipi** family (alongside Skipi Seafarer, Crewing,
Broker). First module: **Job Reporter** — the crew captures work-completion
reports by template (photos before/during/after, resources consumed, notes)
and submits them to the office in one tap.

Counterpart shore app: **Skipi Ship Management** (`../skipi-shipmgmt`).
Both are clients of the shared **`skipi-server`** and key off the same
`Vessel` (IMO) row.

## Stack
Tauri v2 shell (Rust) + single-file `dist/index.html` frontend that talks to
`skipi-server` over HTTP (`fetch`). Camera on Android via `<input capture>`.
No custom Rust commands yet — added when offline `.eml` packaging + transfer
to the ship's comms PC lands (mirror `skipi-crewing/src-tauri/src/api.rs`).

## Server endpoints used
- `GET /api/report-templates` — capture templates (seeded server-side)
- `POST /api/reports` — submit a report (Bearer `ONBOARD_TOKEN`)
- `POST /api/reports/{id}/photos` — attach a photo (multipart)
- `GET /api/reports?imo=…` — the vessel's sent reports

## Run / build
```bash
cd src-tauri
cargo tauri dev            # desktop dev
cargo tauri build          # desktop bundle
# Android (after one-time): cargo tauri android init && cargo tauri android dev
```
Configure server URL + `ONBOARD_TOKEN` + vessel IMO in the in-app ⚙ Settings.

## Status
MVP skeleton (2026-06-15). Online submit works end-to-end. TODO: offline
`.eml` packaging, identity (pubkey) wiring, AI condition analysis (Phase 2).
