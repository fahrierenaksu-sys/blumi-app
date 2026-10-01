# Profile identity and related UI audit — 2026-10-02

Scope: current `develop` checkout; current profile identity after a conversation,
match or room has already been created, plus the five reported UI issues.
Existing staged and unrelated work was preserved. No commit, push or deployment
was performed.

## Root causes and implemented fixes

| Finding | Cause | Implemented correction |
| --- | --- | --- |
| Chat retained the registration name | Both PostgreSQL participant reads selected the name saved when the thread was created. The memory repository also retained that snapshot. | Chat reads now hydrate the current account name and saved avatar. Successful name/avatar saves announce current display metadata to visible chat contacts across every page. Blocked contacts are excluded. |
| A late response or event could restore old identity | Arrival order alone could not distinguish an old profile response from a current saved profile. A name-only event could also erase a known outfit. | Profile timestamps order names; persisted avatar revisions order outfits independently. Missing avatar metadata preserves the known selection. Request sequence remains the compatibility fallback for older responses. |
| The same person differed between loaded chat pages | A newer participant observation updated one thread while another loaded page retained an older participant object. | Every displayed thread resolves through the same immutable per-user identity observations. Account reset clears those observations. Identity updates do not manufacture a conversation. |
| Already-open room, match, profile and debrief screens retained old identity | These screens displayed copied navigation parameters. The avatar snapshot constructor also returned the old snapshot without applying a new name or newer selection. | The screens subscribe to the existing chat identity source by user ID. The avatar constructor accepts newer persisted selections and updates names while retaining a newer existing outfit. Membership, match context, ownership and access remain independent of this display projection. |
| Renaming or changing an outfit could reset the room | Scene-reset dependencies included names and avatar snapshots. Updating identity cancelled walking and discarded seat/speech state. | Scene reset depends on the scene, geometry and participant IDs. A separate metadata update changes name and appearance while preserving movement drivers, positions, seats, bubbles, timers and scene epoch. |
| A fresh room rejoin could lose to an old chat cache | The current name was fetched at rejoin but the room response omitted the account profile version. | Room participants now carry the persisted profile timestamp through server construction, contracts, HTTP parsing and navigation. A newer rejoin snapshot takes precedence over an older cached name. |
| Opening a Discovery card reused stale profile fields | Production card navigation bypassed the current profile request and reused the cached card object. | Opening a production profile reads the current authorized server profile, including name, bio, tags, prompts and saved avatar. Loading, cancellation, retry and unavailable states remain explicit. Demo and self previews remain local. |
| Accessibility preferences could revert after an OS change | A delayed initial accessibility query could overwrite a newer listener event. | A live event invalidates the older query generation in both Reduce Motion and Reduce Transparency stores. |
| Inbox and Shop had unnecessary top-level back buttons | Tab screens retained stack-style header controls. | Removed the two top-level back buttons; detail navigation retains its back actions. |
| Shop preview could inherit partial opacity | The avatar preview was inside the whole-content entrance fade. | Removed that opacity ancestor and confined entrance animation to the shelf. This removes the observed code risk; the exact intermittent device incident has not been reproduced natively. |
| Discovery filters were translucent and cramped | The sheet allowed the underlying page to show through, with oversized decoration and competing footer widths. | Applied an opaque soft surface, compact header, consistent controls and a wider apply action. Narrow/large-text layouts stack controls; the shared dismiss animation honors Reduce Motion. |

## Adversarial checks

Regression cases were reproduced before the relevant behavior changes, including
name-only updates, delayed older responses/events, identity differences between
chat pages, an already-open route, account reset, fresh rejoin precedence,
walking/seat preservation, stale card profile data and late accessibility
queries. New shared timestamp fields are optional for compatibility and validated
at external boundaries.

The review also checked that display observations do not grant ownership or
access; fanout is limited to visible conversations and excludes blocked contacts;
unrelated messages do not rerender a person's identity; and current Discovery
pages hydrate account records rather than freezing account JSON in a deck.

Room decor intentionally remains the accepted-session snapshot. Profile identity
updates do not alter accepted room membership or replace that decor.

## Automated evidence

All checks below passed in this checkout. Counts are per invocation and overlap;
they must not be added together as a unique-test total.

- Shared package build, repository TypeScript checks and mobile lint: passed.
- Mobile chat suite: 266 compiled tests plus 18 hook tests.
- Mobile navigation suite: 219 tests plus 21 lifecycle tests.
- Layout suite: 5 source-contract tests plus 101 behavior tests.
- Theme/engineering suite: 28 tests; accessibility suite: 26 tests.
- Focused server/chat/avatar/schema integration invocation: 188 tests.
- Focused room identity, invite, security and schema invocation: 123 tests.
- Final Discovery API and opened-profile lifecycle invocation: 29 tests.
- New identity merge helper: 100% line / 97.92% branch coverage.
- New live identity model: 100% line / 80% branch coverage.
- New server room-profile helper: 100% line / 96% branch coverage.
- Final diff whitespace check: passed.

PostgreSQL chat query regressions use a test pool. A real PostgreSQL execution,
the complete release gate and production deployment were not performed.

## Scope and remaining evidence

**Implemented / Tested:** the corrections above exist in this checkout and the
listed automated checks passed.

**Native verification OPEN:** the Simulator application could not be opened in
this environment. The existing Metro on port 8081 serves
`/Users/evrenevren/blumi-sdk54/apps/mobile`, not this checkout, and was left
untouched. UI appearance, interaction, large-text layout and the intermittent
Shop fading incident require the actual current-checkout native flow. Physical
device and performance evidence also remain open.

Realtime identity updates cover authorized chat contacts while connected, and
persisted reads/rejoin/profile opening recover current server data. Public deck
cards and unrelated profile fields are not globally broadcast on every edit;
offline clients cannot receive live events. Bio/tags/prompts are refreshed when
the production profile is opened, rather than claimed to be live in every
already-open view.

No artwork, canonical character pixels, cosmetic IDs or runtime image bytes were
changed by this task. The repository character-production skill was read for
avatar runtime integration; work was performed by the primary engineer/conductor
without subagents or image generation. Asset-candidate hashes, pose authoring and
promotion gates are not applicable to this metadata/UI patch. No asset was
promoted. Code changes remain reversible through their reviewed diff.

**Production ready: not claimed.** Native evidence and deployment remain separate
from implementation and automated test evidence.

## Preservation correction — 2026-10-02

Commit `6b1ac89` accidentally included a previously staged inverse patch of
Claude's work. It is superseded by an additive restoration commit, not rewritten
or removed from history. The exact pre-commit patch was reversed to recover
Claude's changes while retaining the live profile/avatar and UI changes above.
The restoration covers 86 paths: 76 match baseline `1627800` exactly; the other
10 retain both sets of changes and were inspected as integration points.

Recovered behavior includes Firebase refresh-token revocation, account-deletion
safety evidence, delivery acknowledgement retries, graceful server shutdown,
safe MiniRoom exit, scene-entry/socket ordering, backpressure resynchronization,
and the two-phone motion regression. The previous removal of unused room props
and the retired sparkle UI is also restored exactly to Claude's baseline.
No character artwork was authored or promoted.

Preservation checks for subsequent deliveries: inspect both staged and unstaged
changes before editing; compare overlapping files against their committed
baseline; stage explicit reviewed paths; never include an inverse patch merely
because it was already staged; never force-push or rewrite another agent's
commits. Commit and push only the authorized work. Push verification must pass
without bypassing hooks. Native and production evidence remain OPEN.

The initial full `npm test` run passed. The push hook's repeated run exposed a
fixture-ordering flaw in the restored acknowledgement flood regression:
messages labelled "older" and "newest" could share a millisecond timestamp,
which receipt cursors break by random message ID. Increasing the deadline did
not resolve it, so that attempted change was discarded. The fixture now uses
explicit increasing send times; all assertions and the original 3-second
deadline remain. The queue implementation, cursor ordering and Claude's
deterministic quota-window unit tests are unchanged.
