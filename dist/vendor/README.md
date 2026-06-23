# Vendored third-party libraries

## qrcode-generator.js

- **Source:** `qrcode-generator` v2.0.4 — https://github.com/kazuhikoarase/qrcode-generator
- **Author:** Kazuhiko Arase
- **License:** MIT (header retained inside the file)
- **File:** copied verbatim from the npm package `qrcode-generator@2.0.4` `dist/qrcode.js`.

### Why vendored (not a CDN, not an npm runtime dep)

Skipi On Board must generate the crew-pairing QR **offline, on the vessel**,
with no internet and no external CDN (a ship has no reliable connectivity).
The app has no JS build step (a single `dist/index.html` loaded by the Tauri
shell), so the encoder is shipped as a local static file and loaded with a
relative `<script src="./vendor/qrcode-generator.js">`. In a plain browser the
file defines a global `qrcode` function (its UMD footer only activates under
CommonJS/AMD). We use only `qrcode(0, 'M')` → `addData` → `make` →
`createDataURL` to render the pairing invite locally.

No code from this file is modified. Update by re-copying the same file from a
newer `qrcode-generator` release.
