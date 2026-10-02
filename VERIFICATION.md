# Verification and publication review

Reviewed **2 October 2026**. This records bounded local checks, not a guarantee
that the prototype has no security or usability defects.

## Environment and scope

Apple Silicon Mac, macOS 27.0, Node 26.3.0, Swift 6.4, Vite 7.3.6,
MediaPipe Tasks Vision 0.10.32. Native code builds for the current architecture
with an explicit macOS 14.0 deployment target; the resulting Mach-O minimum was
checked. Runtime support on macOS 14 and Intel Macs has not been tested.

The review covers committed source/history, dependencies, model acquisition,
static serving, native bridge/permission gates, camera lifecycle, build identity,
and the browser/controller regressions. No external penetration test or formal
audit has been performed.

## Automated results

| Check | Result and boundary |
| --- | --- |
| Gitleaks 8.30.1 | No detected secrets in all six pre-review commits or the tracked source snapshot; no suppression/baseline used |
| npm audit | Zero reported vulnerabilities in the locked dependency graph on the review date; future results may change |
| Unit tests | 15 passed: repeated up/down strokes, ignored returns, pause-to-switch, diagonal/independent axes, jitter, occlusion, loss/gaps, resets, and model substitution/truncation rejection |
| TypeScript + Vite | Production web build passed |
| Browser lab | Real local model/WASM inference with artificial video; actual DOM scroll checks, both axes, bounds/overflow, independent panes, lifecycle/reset behavior, denied/missing camera and failed model handling passed |
| Native-page bridge | Simulated landmarks and fake video: repeated returns, pause reversal, X opt-in/diagonals, full-width preview, camera shutdown, reacquisition and late-consent cleanup passed; no OS input posted |
| Swift/native self-tests | Event signs/caps/fractional reset; real loopback assets; HEAD; missing files; encoded traversal, NUL and backslash; hostile Host/Origin; unsupported methods; security headers passed |
| Expanded raw HTTP tests | Missing/duplicate Host, malformed/oversized headers, and an actual symlink escaping a temporary resource root were rejected |
| Native WebKit | Actual bundled model/WASM performed blank-image inference under the stricter server/CSP; no camera access or OS input |
| Stable signing | Signatures verify; modified sealed bytes change the code hash while retaining the same certificate-pinned designated requirement |
| Asset integrity | Fresh HTTPS download from the pinned upstream URL matched the committed SHA-256; native packaging verifies existing model bytes too |

Native self-tests construct scroll events but never post them. Fake-video tests
do not prove physical recognition or permission prompts. The installed working
app has not been replaced as part of this publication review.

## Hardening included in this review

- Exact Host/Origin checks, explicit HTTP-origin checks on WebKit navigation,
  bridge and camera grants, plus a cap on simultaneous local-server connections.
- CSP additions for base URI/forms, no-referrer and permission-policy headers.
- Verified SHA-256 model download, atomic model replacement and verification
  before native packaging.
- Explicit native deployment target matching the bundle's stated minimum.
- Ignore patterns for generated bundles, model-download remnants, private keys,
  keychains and signing exports; third-party notices/licenses in native bundles.

## Physical evidence and limitations

Earlier local development included user trials of scrolling. The user reported
that the accepted browser fingertip behavior matched the intended motion. Native
camera startup and saved Camera/control permission reuse were observed after
stable-signed UI updates. Those observations apply to that machine and those
builds, not to every Mac or to this source review's new native binary.

The automatic half-second direction switch and current panel footprint still
need broader physical trials. The global shortcut, arbitrary-app scroll routing,
recognition at difficult angles, CPU/battery impact, and ten-minute comfort are
not established by synthetic checks. The native app is not notarized or sandboxed.

## Reproduce

```sh
npm ci
npm run assets
npm test
npm run build
npm audit
# With Gitleaks installed:
gitleaks git . --log-opts='--all' --redact --no-banner
# Start npm run dev -- --port 5173 --strictPort in another terminal, then:
npm run test:browser
npm run test:native-browser
# macOS, after native/SIGNING.md setup:
npm run build:native
npm run test:native-signing
/private/tmp/moves-native/Moves.app/Contents/MacOS/Moves --check-webkit
```

Before publication, scan the final candidate again and review its exact file
list and commit metadata. A clean initial publication snapshot can preserve
local development history without exposing old setup logs or personal author
email metadata. No model, camera recording, signing key or generated app is
part of the intended source publication.
