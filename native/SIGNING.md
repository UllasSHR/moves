# Stable local signing for Moves

An ad-hoc signature identifies a build by its code hash. Rebuilding changes that
hash. macOS's saved Camera and scroll-control approvals can then fail to match,
even when System Settings still displays the old switch as enabled.

Regular native builds now require a certificate and never fall back silently to
ad-hoc signing. The designated requirement pins both the bundle identifier and
the signing certificate fingerprint; a different app cannot match merely by
copying the bundle identifier. Keep using the same certificate and private key.

## One-time local setup

In Keychain Access, use Certificate Assistant → Create a Certificate:

- Name: **Moves Local Development**
- Identity Type: **Self Signed Root**
- Certificate Type: **Code Signing**
- Keep the identity in the login keychain. Keep its private key on this Mac.
- If certificate trust is required, limit it to **Code Signing**; leave other
  policies at their defaults. Do not enable general SSL or system root trust.

This creates a local signing credential, not an Apple Developer ID or a
notarized distribution certificate. It does not publish the app or require an
Apple developer subscription. macOS may ask permission for codesign to use the
private key. Do not grant all applications access to it.

Run `npm run check:native-signing`, then `npm run build:native`. To use an existing
identity, set `MOVES_SIGN_ID` to its certificate SHA-1. Treat replacing/renewing
that identity as a deliberate migration that may require fresh permissions.

When moving from the current ad-hoc app to this identity, approve Camera and
control access once more. Rebuild twice with the same certificate and compare
`codesign -d -r-` output: the designated requirement must be identical even when
the code hash changes. Verify permissions still work after installing an update
and restarting. That physical permission-persistence check is required before
claiming the problem solved.

`npm run build:native:adhoc` is an explicit temporary-build escape hatch. It does
not solve permission persistence and should not replace the normal installed
app during development.

Apple's references:

- https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
- https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html
