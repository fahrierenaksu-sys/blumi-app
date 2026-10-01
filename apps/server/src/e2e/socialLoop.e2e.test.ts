import test from "node:test"
import { startSocialLoop } from "./socialLoopHarness"
import {
  backgroundedPhoneGetsPrivatePushes,
  blockMidRoomStopsEverything,
  chatBurstDeliversOnceInOrderWithReceipts,
  doubleAcceptOpensOneRoom,
  expiredInviteOpensNothing,
  logoutAndAccountSwitchSilenceTheOldSocket,
  mutualLikeOpensOneThread,
  sharedRoomSyncsMotionChatAndPresence,
  simultaneousInvitesMakeOneRoom,
  simultaneousLikesMakeOneMatch,
  type ScenarioContext
} from "./socialLoopScenarios"

/**
 * End-to-end social loop, in memory: two (and more) simulated phones drive
 * mutual match -> chat -> chat-initiated room invite -> shared room over real
 * HTTP and real websockets against the production service graph and routes
 * (see socialLoopHarness.ts for the seams). Each scenario asserts both
 * people's views, ordering, exactly-once delivery, and a latency budget for
 * every realtime hop. Waits are bounded (2 s per event); there are no sleeps
 * on the success path. The PostgreSQL twin is socialLoop.postgres.test.ts.
 */

const EVENT_BUDGET_MS = 200

async function withHarness(
  t: import("node:test").TestContext,
  scenario: (context: ScenarioContext) => Promise<void>
): Promise<void> {
  const harness = await startSocialLoop({ storage: "memory" })
  try {
    await scenario({ harness, eventBudgetMs: EVENT_BUDGET_MS, report: (line) => t.diagnostic(line) })
  } finally {
    await harness.close()
  }
}

test("1. onboarding -> Discover -> mutual like opens exactly one match and one chat for both phones", (t) =>
  withHarness(t, mutualLikeOpensOneThread))

test("2. twenty HTTP messages reach the partner once and in order, with sent, delivered and mutual-only read ticks", (t) =>
  withHarness(t, chatBurstDeliversOnceInOrderWithReceipts))

test("3. chat invite -> shared room: motion in order to the final target, room chat once each, presence and resync", (t) =>
  withHarness(t, sharedRoomSyncsMotionChatAndPresence))

test("4a. both like each other at the same moment: one match, one chat", (t) =>
  withHarness(t, simultaneousLikesMakeOneMatch))

test("4b. both invite each other at the same moment: one invite, one room", (t) =>
  withHarness(t, simultaneousInvitesMakeOneRoom))

test("4c. accepting twice (concurrently and again) opens one room", (t) =>
  withHarness(t, doubleAcceptOpensOneRoom))

test("4d. accepting an expired invite opens nothing and tells nobody", (t) =>
  withHarness(t, expiredInviteOpensNothing))

test("4e. a block in the middle of a room session stops every event for both people", (t) =>
  withHarness(t, blockMidRoomStopsEverything))

test("4f. sign-out and an account switch on the same phone silence the old socket", (t) =>
  withHarness(t, logoutAndAccountSwitchSilenceTheOldSocket))

test("5. a backgrounded phone gets one private push per like, match, message and invite", (t) =>
  withHarness(t, backgroundedPhoneGetsPrivatePushes))
