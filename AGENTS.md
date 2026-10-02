# Working on Moves

Moves is an experimental camera-based scrolling app with a macOS companion
and a browser reading lab. Read README.md, SECURITY.md, VERIFICATION.md, and
relevant source before changing behavior. Current source and user feedback take
precedence over older verification notes. Follow higher-priority instructions.

## Product behavior to preserve

- Track corresponding index, middle, ring, and little fingertips. Do not require
  straight fingers, a precise palm angle, a pinch, or perfectly matching heights.
  Preserve the controller's tolerance for one unusable or erratic fingertip.
- Native vertical scrolling uses repeated strokes: first deliberate movement
  chooses a direction; the opposite return rebases without undoing progress.
  A stable 500 ms pause rearms direction selection. Slow motion must not count
  as a pause. Do not replace this with unrestricted bidirectional displacement.
- The browser lab intentionally retains an explicit direction selector. Do not
  silently make its controls or tests describe the native behavior.
- Native sideways scrolling is off on launch and requires explicit menu opt-in.
  When enabled, both axes may move together. The lab enables each axis only for
  actual selected-pane overflow; native cannot inspect other apps' DOM.
- Keep axes independent and output bounded. Preserve no queued excess motion,
  no trailing inertia, immediate stationary stop, and rebasing after tracking
  loss, gaps, configuration changes, target changes, or discontinuities.
- Keep the native camera visible as a readable full-width rectangular preview,
  with aligned fingertip markers. Details may collapse; the camera must not be
  hidden or shrunk to a tiny circular view. Keep the panel compact and unobtrusive.
- Use black, white, and grayscale for logo/branding work. Do not introduce green
  accents. Treat changes to existing tracking feedback as behavior-affecting UI
  work, and verify that hand-placement feedback remains readable.

## Privacy and native boundaries

- Camera capture and scroll output start only after explicit user activation and
  the necessary macOS approvals. Keep Stop/Escape/close/sleep/lock/error handling
  effective, including cleanup of late camera-consent results.
- Keep camera frames and landmarks local and ephemeral. Do not add recording,
  uploads, analytics, microphones, credentials, or network services by default.
- Preserve loopback-only serving, resource-root/symlink containment, exact
  Host/Origin restrictions, bounded requests/connections, and security headers.
- Preserve exact-origin/main-frame native messages, session-generation checks,
  permission/output gates, finite bounded deltas, and target-change resets.
- Regular native builds require the stable local certificate identity. Never
  silently fall back to ad-hoc signing or change bundle identity/certificate
  requirements. See native/SIGNING.md. Do not reset permissions, export private
  keys, change Keychain trust, or replace an installed app as a routine check.
- Keep the model URL/checksum pinned and verify bytes before native packaging.
  Preserve third-party notices. Never commit credentials, private keys, keychains,
  recordings, downloaded model/WASM, dependencies, or generated app bundles.

## Source map

- src/gesture.ts: motion consensus, direction/recovery, axes, and resets.
- src/tracker.worker.ts: local MediaPipe inference.
- src/main.ts: browser lab and selected DOM panes.
- src/native.ts and src/native.css: native WebKit camera UI and bridge.
- native/main.swift: panel, permissions, menu, hotkeys, and native output gates.
- native/LoopbackServer.swift: local static HTTP serving.
- native/ScrollOutput.swift: Quartz event construction.
- scripts/: asset integrity, builds, and browser/signing checks.

## Focused validation

Inspect Git status and relevant files before editing. Preserve unrelated work.
Use the smallest focused change; add regression checks for meaningful behavior
changes. Do not add tests that merely mirror trivial styling or documentation.

Initial setup: npm ci, then npm run assets.

- Controller changes: npm test and npm run build; run the relevant browser flow.
- Browser lab: start npm run dev -- --port 5173 --strictPort, then run
  npm run test:browser with Google Chrome installed.
- Native WebKit UI/bridge: npm run test:native-browser against that dev server.
- Swift/server/build changes: npm run build:native on macOS with a valid stable
  signing identity. This runs native self-tests without posting OS input.
- Signing changes: npm run test:native-signing. WebKit/model/CSP changes also
  require the built executable's --check-webkit mode; it uses no camera.
- Public-source preparation: inspect intended files and commit metadata, run
  npm audit and a redacted secret scan over the intended publication history.

Synthetic landmarks, artificial video, and constructed events do not establish
real-camera comfort, physical shortcut behavior, universal app support, battery
usage, or permission persistence on another Mac. State what was actually checked
and what still needs a user trial. Never post system input during automated tests.

## Git and reporting

Inspect the current branch, upstream, and remotes before Git operations. Do not
push unrelated local development history or all branches/tags. Stage only intended
files. Public pushes, releases, PRs, installed-app replacement, and other external
changes need user authorization; existing session authorization remains valid.

Keep README.md, SECURITY.md, and VERIFICATION.md accurate when behavior or security
boundaries change. Report whether work is local, published, built, verified, or
user-reported. Durable instructions/memory changes require an explicit user request.
