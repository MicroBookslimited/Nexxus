---
name: Expo prod bundle resolves all require() literals
description: Why deployment builds can fail on RN code that works in Expo Go dev
---

The nexus-mobile artifact deploys as a **static Expo Go bundle** (`scripts/build.js` runs `expo export` / Metro `--no-dev --minify`), and the root deploy build runs `pnpm -r run build`, so the mobile bundle MUST compile for the deployment to publish — even though printing only runs in a native dev build.

**Rule:** Metro statically bundles every `require("literal")` and `import` it can see, including lazy ones inside functions. A `try/catch require("native-module")` keeps the app loading in Expo Go at RUNTIME, but Metro still tries to RESOLVE the module at bundle time. If the module is a NATIVE module it resolves fine (the JS shim exists in node_modules); if it's a package that simply isn't installed (e.g. `buffer`), the production bundle FAILS even though dev preview seemed ok.

**Why:** a `require("buffer").Buffer` in app code broke `expo export` ("Unable to resolve module buffer") even though it was lazy and dev preview looked fine. The durable pattern for sending raw bytes over react-native-tcp-socket without a buffer polyfill: encode to base64 with a local encoder and `client.write(b64, "base64")` (the socket accepts an encoding arg) — the same base64 path the BLE transport uses.

**How to apply:** In RN/Expo code, never depend on Node core polyfills (`buffer`, `stream`, etc.) unless the package is actually installed. Prefer Uint8Array + the local base64 encoder. Verify mobile changes with `npx expo export --platform ios` (and android), not just typecheck — typecheck does NOT catch unresolved Metro modules.
