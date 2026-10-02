# node-forge CVE-2026-85393 mitigation

The October 2 main CI run failed at `audit:release`, not at build, unit tests,
or PostgreSQL verification. Both the previous and current main lockfiles used
node-forge 1.4.0. The advisory was reviewed on October 1. As of October 2, npm
still publishes 1.4.0 as latest and the advisory lists no patched version.

Sources:
- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://github.com/digitalbazaar/forge/issues/1149
- https://github.com/digitalbazaar/forge/pull/1152 (unmerged proposal)

## Mitigation

The existing postinstall `patch-package --error-on-fail` applies
`patches/node-forge+1.4.0.patch`. The RSA PKCS#1 v1.5 verifier rejects extra
AlgorithmIdentifier children, a non-NULL second child, nonempty NULL and
constructed NULL. It preserves the original outer DigestInfo validation and
valid OID-only or OID plus empty primitive NULL forms. This is a local
backport/hardening, not an official upstream release or approval.

The regression suite signs intentionally malformed DigestInfo structures
with an ephemeral test key (exponent 3). It tests the parser gap rather than
claiming a private-key-free forgery demonstration. The unpatched package
accepted all four malformed nested variants; the patched package rejects
them. Node's native crypto verifier independently rejects each variant.
Positive tests preserve valid signatures, wrong-message rejection and Expo
update signing interoperability with native crypto.

`audit:release` runs these tests against the installed package before checking
the audit policy. Tests also require lockfile version 1.4.0, exactly one forge
copy and the Expo certificate consumer resolving that copy. A missing patch,
additional copy or version change fails the gate. A clean install reapplies
the patch through postinstall; ignoring install scripts fails the behavioral
gate. The exact advisory exception expires October 16, 2026. Other advisories
remain subject to the existing policy.

Raw `npm audit` and Dependabot will continue reporting the advisory because
the package version stays 1.4.0; their metadata does not inspect local patches.
The exception covers this tested mitigation only. It must be removed with the
patch once an official fixed release is verified compatible with Expo.

## Evidence and scope

- Before patch: 4 failing malformed-input regression tests, 4 passing checks.
- After patch: all 8 regression and compatibility tests passed.
- No app feature, avatar asset, persisted data or production service changed.
- Isolated fresh `npm ci`: postinstall applied the patch; 8/8 tests passed.
- Isolated `npm ci --ignore-scripts`: the real audit runner failed on all four
  malformed-input checks despite the exception. Reapplying postinstall restored
  8/8 passes and the release audit passed.
- Current checkout: `audit:release`, audit policy tests (2/2), source hygiene
  (9/9) and workspace TypeScript checks passed. Lint passed with one existing
  import-order warning in `chatStore.ts` and no errors.
- Delivery verification initially found two unrelated existing test issues:
  same-millisecond receipt fixtures assumed UUID call order, and the load
  latency test competed with functional test processes. The fixture now uses
  increasing timestamps; the runner isolates the load test with its original
  assertions and thresholds. These are separate from the security patch.
- The unchanged source, release infrastructure, builds, typecheck, lint,
  mobile/domain/realtime test gates passed in the full verification runs.
  After the test corrections, the complete server suite, isolated load test,
  PostgreSQL gate, release audit and Expo Doctor (21/21) passed. The two initial
  full-command runs failed before these corrections; do not count them as
  successful runs. Remote CI is still pending delivery.
- Native UI evidence does not apply to this Node build-tool verifier change.
- This document does not claim a deployed fix; local implementation and remote
  delivery are separate states.
