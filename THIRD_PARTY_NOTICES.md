# Third-party notices

Moves' MIT license applies to original project code. It does not replace the
licenses of dependencies, generated runtime artifacts, or the downloaded model.

## MediaPipe

- Package: `@mediapipe/tasks-vision` 0.10.32 (declares Apache-2.0).
- Upstream: https://github.com/google-ai-edge/mediapipe
- License text: [Apache License 2.0](licenses/Apache-2.0.txt).
- Runtime: JavaScript and WASM copied/bundled from the installed package;
  original license comments must be retained.
- Model: Google's Hand Landmarker, float16, version 1, downloaded from:
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- Expected SHA-256:
  `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`.
- Official guide: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- The upstream guide links the hand-tracking model card, which specifies Apache
  License 2.0:
  https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf

Model/WASM bytes are not stored in this Git repository. Native builds include
this notice and the Apache license in their Resources folder. Preserve these
notices and relevant upstream notices when distributing generated applications;
this repository does not currently distribute application binaries.

## Development tooling

TypeScript (Apache-2.0), Playwright (Apache-2.0), Vite (MIT), esbuild (MIT), and
tsx (MIT) are development dependencies. Their resolved versions and transitive
dependencies are recorded in `package-lock.json`. Their licenses remain with the
installed packages. Apple frameworks are supplied by macOS and are not bundled
by this repository.
