# P0-qr-scanner: QRScanner primitive in packages/ui on expo-camera
status: done
branch: worktree-wf_40a85a5f-46a-1
changed: packages/ui/src/scanner/** (QRScanner, QRCamera, QRNotice, QRPasteField, qrState, qrLabels, scanner.test.tsx), packages/ui/src/gallery/{galleryScanner.tsx,Gallery.tsx} (new `scanner` section), packages/ui/src/primitives/Icon.tsx (`camera`, `torch`), packages/ui/src/index.ts, packages/ui/package.json + apps/mobile/package.json (expo-camera ~58.0.14), apps/mobile/app.json (expo-camera plugin with cameraPermission, `locales.es`), apps/mobile/locales/es.json, pnpm-lock.yaml
tests: `pnpm verify-fast` green; ui jest scanner suite 9/9 (qrState, code gate, granted/paused/torch, denied + Settings + paste, ask-again, first-visit ask, blank paste)
acceptance:
- QRScanner primitive with onCode(text): met (`QRScanner`, one delivery per burst via `createCodeGate`, 2 s window).
- torch toggle: met (capsule button, label flips; iOS screenshot ios-2.png).
- permission-denied state with Settings link: met (iOS screenshot ios-3.png after `simctl privacy revoke camera`; button calls `Linking.openSettings`). Prompt-still-allowed state shows "Allow Camera".
- paste-code fallback: met (always under the preview unless `hidePaste`); works without camera.
- unavailable state (no camera / expo-camera missing from the build): met in tests; camera module is loaded lazily so an older dev client still starts.
- camera permission copy in app.json via config plugin, mirroring Swift NSCameraUsageDescription + Spanish: met (en via plugin, es via `locales`); the iOS Info.plist after prebuild contains the English text. Spanish localization file not inspected on device.
- gallery entry: met (`/__gallery?section=scanner`).
- prebuild --clean + iOS on simulator: met (renders, torch, denied state). Android: see notes.
left:
- Torch labels, allow-camera and "Use Code" have no catalog keys (catalogs are generated from Swift): the pairing screen should pass `labels` with t() for the existing keys (Camera Access Needed, Open Settings, Scanning Unavailable, ...) and add the four new strings to the catalog source.
- The simulator has no camera: an actual scan was not exercised (unit-tested only); do one on a device.
- The yellow "Open debugger to view warnings" toast appeared on the iOS gallery; not investigated.
notes:
- expo-camera must be rebuilt natively by the integrator (new dependency, app.json changed).
- Spanish copy says "OpenAgentsPocket" in place of "Agentico".
