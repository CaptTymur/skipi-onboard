# Smoke report — Onboard Host Check (host-readiness fixture)

This is **not** a product plugin — it is a bundled placeholder used to verify the
On Board plugin host (Install / Open / Disable, mount/unmount, theme + sandboxed
storage host API, permissions/safety screen). Real plugins (e.g. BNWAS) are built
and validated in the plugin lab, then handed off — see Obsidian
"Skipi Plugin Lab" and "Skipi Plugin Update Mechanism — bundled first-party MVP".

## Capabilities declared
- permissions: `local_storage`
- network/documents/account/analytics: `none`; server_upload: `false`
- No access to crew, paired devices, vessel documents, certificates or pairing secrets.

## Host-contract checks (verified during On Board home smoke)
- Tile renders under Apps with state Available → Installed/Disabled.
- Install writes local state and shows permissions/safety copy.
- Open mounts the plugin into the host container with a narrow `hostApi`.
- Counter persists via `host.storage` (namespaced to the plugin id).
- `host.navigation.setTitle` and `closePlugin` work.
- Disable calls `unmount` and stops the plugin.
- No host domain data (crew/vessel-docs/pairing) is reachable from the plugin.
