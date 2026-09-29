import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService, type AuthService } from "../auth/authService"
import { createAccountRecord, createBlumiBackendStore } from "../auth/authStore"
import { createChatService } from "../chat/chatService"
import { createInMemoryMatchRepository, createInMemoryMatchStore } from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createConnectionManager } from "../realtime/connectionManager"
import { createSafetyService, type SafetyService } from "../safety/safetyService"
import { createServer } from "../server"

// Counts repository calls behind POST /v1/threads/sync-matches and
// GET /v1/safety/blocks. Before batching both routes issued per-partner /
// per-block lookups (N+1); the batched routes must issue a constant number.

interface CallCounts {
  findBlock: number
  listBlockedUserIdsBetween: number
  findAccountByUserId: number
  findAccountsByUserIds: number
}

function countRepositoryCalls(authService: AuthService, safetyService: SafetyService): CallCounts {
  const counts: CallCounts = {
    findBlock: 0,
    listBlockedUserIdsBetween: 0,
    findAccountByUserId: 0,
    findAccountsByUserIds: 0
  }
  const safety = safetyService.repository
  const findBlock = safety.findBlock.bind(safety)
  safety.findBlock = async (...args) => { counts.findBlock += 1; return findBlock(...args) }
  const listBlocked = safety.listBlockedUserIdsBetween.bind(safety)
  safety.listBlockedUserIdsBetween = async (...args) => {
    counts.listBlockedUserIdsBetween += 1
    return listBlocked(...args)
  }
  const auth = authService.repository
  const findOne = auth.findAccountByUserId.bind(auth)
  auth.findAccountByUserId = async (...args) => { counts.findAccountByUserId += 1; return findOne(...args) }
  const findMany = auth.findAccountsByUserIds.bind(auth)
  auth.findAccountsByUserIds = async (...args) => { counts.findAccountsByUserIds += 1; return findMany(...args) }
  return counts
}

function resetCounts(counts: CallCounts): void {
  for (const key of Object.keys(counts) as Array<keyof CallCounts>) counts[key] = 0
}

async function registerEligibleViewer(
  app: ReturnType<typeof createServer>,
  authService: AuthService,
  phoneNumber: string
): Promise<{ token: string; userId: string }> {
  assert.equal((await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber } })).statusCode, 202)
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber, verificationCode: "482931" }
  })
  assert.equal(verified.statusCode, 200)
  const token = verified.json().session.sessionToken as string
  assert.ok(await authService.updateProfile(token, {
    displayName: "Viewer", age: 24, gender: "woman", avatarPresetId: "avatar_v2_body_default"
  }))
  for (const step of ["profile", "avatar", "room"] as const) {
    assert.ok(await authService.completeOnboardingStep(token, step))
  }
  return { token, userId: (await authService.getSession(token))!.account.userId }
}

async function seedPartner(authService: AuthService, index: number, displayName: string): Promise<string> {
  const account = createAccountRecord(`+90555000${String(index).padStart(4, "0")}`)
  account.profile.displayName = displayName
  await authService.repository.saveAccount(account)
  return account.userId
}

async function createSyncHarness(partnerCount: number, nameFor = (index: number) => `Partner ${index}`) {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const matchRepository = createInMemoryMatchRepository(createInMemoryMatchStore([]))
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const connectionManager = createConnectionManager()
  const events: Array<{ threadId: string; userIds: string[] }> = []
  const sendToUsers = connectionManager.sendToUsers
  connectionManager.sendToUsers = (userIds, event) => {
    if (event.type === "chat.thread_created") events.push({ threadId: event.payload.threadId, userIds: [...userIds] })
    sendToUsers(userIds, event)
  }
  const app = createServer({
    authService,
    matchService: createMatchService({ repository: matchRepository }),
    chatService,
    safetyService,
    connectionManager
  })
  const viewer = await registerEligibleViewer(app, authService, "+905559990001")
  const partners: string[] = []
  for (let index = 0; index < partnerCount; index += 1) {
    const partner = await seedPartner(authService, index, nameFor(index))
    partners.push(partner)
    await matchRepository.createMatch({
      matchId: `match_${index}`,
      participantUserIds: [viewer.userId, partner],
      matchedAt: new Date(Date.UTC(2026, 8, 29, 10, index)).toISOString()
    })
  }
  const counts = countRepositoryCalls(authService, safetyService)
  const sync = () => app.inject({
    method: "POST",
    url: "/v1/threads/sync-matches",
    headers: { authorization: `Bearer ${viewer.token}` }
  })
  return { app, authService, chatService, safetyService, viewer, partners, counts, events, sync }
}

test("sync-matches issues a constant number of block and account lookups for any partner count", async () => {
  const observed: Record<number, CallCounts> = {}
  for (const partnerCount of [1, 6]) {
    const harness = await createSyncHarness(partnerCount)
    try {
      resetCounts(harness.counts)
      const response = await harness.sync()
      assert.equal(response.statusCode, 200)
      assert.equal(response.json().threads.length, partnerCount)
      assert.equal(harness.events.length, partnerCount)
      observed[partnerCount] = { ...harness.counts }

      // All threads now exist: a repeat sync performs no block/account lookups
      // beyond session resolution.
      resetCounts(harness.counts)
      assert.equal((await harness.sync()).json().threads.length, partnerCount)
      assert.equal(harness.counts.findBlock, 0)
      assert.equal(harness.counts.listBlockedUserIdsBetween, 0)
      assert.equal(harness.counts.findAccountsByUserIds, 0)
      assert.equal(harness.events.length, partnerCount)
    } finally {
      await harness.app.close()
    }
  }
  // Before: findBlock = 4 per partner (two hasBlockBetween calls, each two
  // directional reads) and findAccountByUserId = 2 per partner.
  for (const counts of Object.values(observed)) {
    assert.equal(counts.findBlock, 0)
    assert.equal(counts.listBlockedUserIdsBetween, 2)
    assert.equal(counts.findAccountsByUserIds, 1)
  }
  // Remaining single-account reads come from session resolution only.
  assert.equal(observed[1]!.findAccountByUserId, observed[6]!.findAccountByUserId)
})

test("sync-matches still skips blocked or nameless partners and suppresses events for blocks landing mid-sync", async () => {
  const harness = await createSyncHarness(4, (index) => index === 2 ? "" : `Partner ${index}`)
  try {
    const [blockedBefore, blockedDuring, nameless, open] = harness.partners as [string, string, string, string]
    await harness.safetyService.blockUser(blockedBefore, harness.viewer.userId)
    assert.equal((await harness.authService.repository.findAccountByUserId(nameless))?.profile.displayName, "")

    const createThread = harness.chatService.createThread.bind(harness.chatService)
    harness.chatService.createThread = async (input, now) => {
      const thread = await createThread(input, now)
      if (input.participantUserIds.includes(blockedDuring)) {
        await harness.safetyService.blockUser(harness.viewer.userId, blockedDuring)
      }
      return thread
    }

    const response = await harness.sync()
    assert.equal(response.statusCode, 200)
    const threadIds = response.json().threads.map((thread: { threadId: string }) => thread.threadId).sort()
    // The thread for the partner blocked mid-sync was created (as before) but
    // never announced; the pre-blocked and nameless partners get no thread.
    assert.equal(threadIds.includes("thread_match_match_0"), false)
    assert.equal(threadIds.includes("thread_match_match_2"), false)
    assert.deepEqual(harness.events.map((event) => event.threadId), ["thread_match_match_3"])
    assert.deepEqual(harness.events[0]!.userIds.sort(), [harness.viewer.userId, open].sort())
    assert.ok(await harness.chatService.repository.findExistingThreadIds(["thread_match_match_1"]).then((ids) => ids.has("thread_match_match_1")))
  } finally {
    await harness.app.close()
  }
})

test("GET /v1/safety/blocks resolves blocked profiles with one batched account lookup", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const safetyService = createSafetyService()
  const app = createServer({ authService, safetyService })
  try {
    const viewer = await registerEligibleViewer(app, authService, "+905559990002")
    const known: string[] = []
    for (let index = 0; index < 5; index += 1) {
      known.push(await seedPartner(authService, 100 + index, `Blocked ${index}`))
    }
    for (const [index, userId] of [...known, "user_missing_account"].entries()) {
      await safetyService.blockUser(viewer.userId, userId, new Date(Date.UTC(2026, 8, 29, 10, index)))
    }
    const counts = countRepositoryCalls(authService, safetyService)
    const baseline = await app.inject({ method: "GET", url: "/v1/users/me", headers: { authorization: `Bearer ${viewer.token}` } })
    assert.equal(baseline.statusCode, 200)
    const sessionReads = counts.findAccountByUserId
    resetCounts(counts)

    const response = await app.inject({
      method: "GET",
      url: "/v1/safety/blocks",
      headers: { authorization: `Bearer ${viewer.token}` }
    })
    assert.equal(response.statusCode, 200)
    // Before: one findAccountByUserId per block (6 here).
    assert.equal(counts.findAccountsByUserIds, 1)
    assert.ok(counts.findAccountByUserId <= sessionReads)
    const body = response.json() as {
      userId: string
      blocks: Array<{ blockedUserId: string; blockedProfile?: { userId: string; displayName: string } }>
    }
    assert.equal(body.userId, viewer.userId)
    // Newest first, unchanged; an unknown account keeps the bare block record.
    assert.deepEqual(body.blocks.map((block) => block.blockedUserId), ["user_missing_account", ...known.reverse()])
    assert.equal(body.blocks[0]!.blockedProfile, undefined)
    for (const block of body.blocks.slice(1)) {
      assert.equal(block.blockedProfile?.userId, block.blockedUserId)
      assert.match(block.blockedProfile?.displayName ?? "", /^Blocked \d$/)
    }
  } finally {
    await app.close()
  }
})

test("in-memory findAccountsByUserIds matches per-ID lookups and ignores duplicates and unknown IDs", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const first = await seedPartner(authService, 200, "First")
  const second = await seedPartner(authService, 201, "Second")
  const repository = authService.repository
  assert.deepEqual(await repository.findAccountsByUserIds([]), [])
  const found = await repository.findAccountsByUserIds([first, second, first, "user_unknown"])
  assert.equal(found.length, 2)
  for (const userId of [first, second]) {
    assert.deepEqual(found.find((account) => account.userId === userId), await repository.findAccountByUserId(userId))
  }
  found[0]!.profile.displayName = "mutated"
  assert.notEqual((await repository.findAccountByUserId(found[0]!.userId))?.profile.displayName, "mutated")
})
