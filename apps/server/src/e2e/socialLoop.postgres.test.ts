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
 * The social-loop scenarios of socialLoop.e2e.test.ts against PostgreSQL:
 * the production repositories, the migration 070 receipt probe, the database
 * realtime ticket store and the LISTEN/NOTIFY fanout, behind the same real
 * HTTP and websocket surface. Runs only through the isolated gate
 * (`npm run verify:postgres`), which migrates a fresh database and sets
 * process.env.DATABASE_URL and BLUMI_TEST_REQUIRE_POSTGRES=1. Accounts are
 * unique per test, so the scenarios share that database safely.
 */

const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}
/** A hang or a lost event fails; the measured times are reported, not tuned. */
const POSTGRES_EVENT_BUDGET_MS = 1_000

function onPostgres(scenario: (context: ScenarioContext) => Promise<void>) {
  return async (t: import("node:test").TestContext) => {
    const harness = await startSocialLoop({ storage: "postgres" })
    try {
      await scenario({ harness, eventBudgetMs: POSTGRES_EVENT_BUDGET_MS, report: (line) => t.diagnostic(line) })
    } finally {
      await harness.close()
    }
  }
}

test("PostgreSQL 1. mutual like opens exactly one match and one chat for both phones", requirePostgres,
  onPostgres(mutualLikeOpensOneThread))
test("PostgreSQL 2. chat burst once and in order, with sent, delivered and mutual-only read ticks", requirePostgres,
  onPostgres(chatBurstDeliversOnceInOrderWithReceipts))
test("PostgreSQL 3. shared room motion, room chat, presence and resync", requirePostgres,
  onPostgres(sharedRoomSyncsMotionChatAndPresence))
test("PostgreSQL 4a. simultaneous likes make one match", requirePostgres,
  onPostgres(simultaneousLikesMakeOneMatch))
test("PostgreSQL 4b. simultaneous invites make one room", requirePostgres,
  onPostgres(simultaneousInvitesMakeOneRoom))
test("PostgreSQL 4c. accepting twice opens one room", requirePostgres,
  onPostgres(doubleAcceptOpensOneRoom))
test("PostgreSQL 4d. an expired invite opens nothing", requirePostgres,
  onPostgres(expiredInviteOpensNothing))
test("PostgreSQL 4e. a block mid-room stops everything for both people", requirePostgres,
  onPostgres(blockMidRoomStopsEverything))
test("PostgreSQL 4f. sign-out and account switch silence the old socket", requirePostgres,
  onPostgres(logoutAndAccountSwitchSilenceTheOldSocket))
test("PostgreSQL 5. a backgrounded phone gets one private push per event", requirePostgres,
  onPostgres(backgroundedPhoneGetsPrivatePushes))
