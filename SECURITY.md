# Security and privacy

Moves is an experimental source prototype. There is no independently audited
or notarized release and no maintained older release line. Security fixes are
intended for the current source; review changes before rebuilding.

## Data and permissions

- Camera frames and landmark results are processed in memory. The application
  has no recording, telemetry, landmark-history, or upload feature.
- The camera starts only after an explicit toggle and macOS Camera approval.
  Warm-up inference uses a blank canvas and does not request the camera.
- Native output requires macOS event-posting permission. No microphone, screen
  capture, Full Disk Access, credentials, or user account is required by Moves.
- Stop closes camera tracks, destroys the worker, invalidates the session, and
  clears output. Close, sleep/lock, process failure, and stale native tracking
  also stop the session. A model losing sight of the hand emits no new motion
  and rebases, but leaves the camera session active for reacquisition.
- Setup downloads npm dependencies and Google's model. Runtime assets are local.
  The model's SHA-256 is pinned; npm uses the committed lockfile. Pinning detects
  substituted bytes, but is not a model-safety assessment or signed provenance.

## Native trust boundaries

The static server binds only to 127.0.0.1 on an ephemeral port. It accepts GET/HEAD,
requires the exact loopback Host, rejects foreign Origin headers, limits pending
connections and request size/time, and resolves file paths and symlinks within
its resource root. It does not expose a scroll-command HTTP endpoint. It sends
CSP, no-sniff, no-referrer, and permission-policy headers and grants no CORS access.

WebKit navigation and camera grants require the exact local HTTP origin. Native
messages require its main frame. Privileged scroll messages also require the
current generation, an enabled/armed session, output permission, a different
foreground app, a pointer outside the Moves panel, and finite bounded deltas.
Target/configuration changes clear fractional output and rebase the controller.

A local process can read public static assets through loopback. The port is not
a secret or a general security boundary. The app trusts its installed bundle and
the current user's account: malicious local code, altered sources/resources,
compromised dependencies, and a compromised OS are outside this prototype's
protection. Moves is not configured as an App Sandbox distribution.

## Signing and source hygiene

Regular native builds require a stable certificate and pin its fingerprint in
the designated requirement. Ad-hoc builds are explicitly separate. Local signing
preserves identity across updates; it is not Developer ID or notarization.

Keep private keys in Keychain. Never commit signing identities, keychains,
certificate exports, environment files, recordings, or personal setup logs.
Generated bundles/model/WASM are excluded. The source license does not grant
rights to publish anyone's camera images.

## Report a vulnerability

Do not put secrets, private camera data, or an exploit affecting users in a
public issue. Use GitHub's private **Report a vulnerability** option on this
repository when available. If it is unavailable, open only a minimal issue
asking the maintainer to provide a private reporting channel, without exploit
details. No guaranteed response time or bug-bounty program is offered.

Include the affected commit, macOS/browser versions, reproduction, expected
boundary, impact, and a suggested fix where possible. Use synthetic inputs.

See [VERIFICATION.md](VERIFICATION.md) for the scope of the local publication
review. Passing a dependency or secret scan does not prove absence of all flaws.
