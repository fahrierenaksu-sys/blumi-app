import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import pg from "pg"
import { createPresenceService } from "../presence/presenceService"
import type { PresenceRecord } from "../presence/presenceRepository"
import { createRoomService, PUBLIC_LOBBY_ROOM_ID } from "../rooms/roomService"
import { createPostgresPresenceRepository } from "./postgresPresenceRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

const avatar: CompleteAvatarSelection = {
  presetId: "avatar_v2_body_default",
  revision: 4,
  loadout: {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    accessoryIds: ["avatar_v2_accessory_golden_heart_locket"]
  }
}

const canonicalAccountAvatar: CompleteAvatarSelection = {
  ...avatar,
  revision: 5,
  loadout: {
    ...avatar.loadout,
    accessoryIds: []
  }
}

const presenceRow = {
  room_id: "room_one",
  user_id: "user_one",
  display_name: "Defne",
  avatar_preset_id: avatar.presetId,
  avatar_selection: avatar.loadout,
  avatar_revision: avatar.revision,
  spot_id: "spot_one",
  in_mini_room: false,
  joined_at: "2026-07-13T10:00:00.000Z",
  updated_at: "2026-07-13T10:00:00.000Z",
  expires_at: "2026-07-13T10:10:00.000Z"
}

function createFakePool(rows: Record<string, unknown>[] = []) {
  const calls: QueryCall[] = []
  const executor = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, values })
      if (text.includes("SELECT clock_timestamp() AS checked_at")) {
        return { rows: [{ checked_at: new Date() }] }
      }
      return { rows: text.includes("SELECT") ? rows : [] }
    }
  }
  return {
    calls,
    pool: {
      ...executor,
      async connect() {
        return { ...executor, release() {} }
      }
    }
  }
}

const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}

test("PostgreSQL presence reads show the canonical account avatar, never a stale cached copy, and never delete", requirePostgres, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const suffix = randomUUID()
  const roomId = `presence_avatar_room_${suffix}`
  const otherRoomId = `presence_avatar_other_${suffix}`
  const repository = createPostgresPresenceRepository(pool)
  const now = new Date()
  const staleCachedAvatars: CompleteAvatarSelection[] = [
    avatar,
    { ...avatar, revision: canonicalAccountAvatar.revision },
    { ...avatar, revision: canonicalAccountAvatar.revision + 1 }
  ]
  const userIds: string[] = []
  try {
    for (const [index, staleAvatar] of staleCachedAvatars.entries()) {
      const userId = `presence_avatar_${suffix}_${index}`
      userIds.push(userId)
      await seedAccount(pool, userId, now, canonicalAccountAvatar)
      await repository.savePresence({ ...makePresenceRecord(roomId, userId, now), avatar: staleAvatar, spotId: `spot_${index}` })
      await repository.savePresence({ ...makePresenceRecord(otherRoomId, userId, now), avatar: staleAvatar, spotId: `spot_${index}` })
    }
    const countRows = async () => Number((await pool.query(
      "SELECT count(*)::int AS n FROM blumi_room_presence WHERE room_id = ANY($1::text[])",
      [[roomId, otherRoomId]]
    )).rows[0]?.n)
    const rowsBefore = await countRows()

    const listed = await repository.listRoomPresence(roomId, now)
    assert.equal(listed.length, staleCachedAvatars.length)
    for (const record of listed) assert.deepEqual(record.avatar, canonicalAccountAvatar)
    for (const userId of userIds) {
      assert.deepEqual((await repository.findUserPresence(roomId, userId, now))?.avatar, canonicalAccountAvatar)
      assert.deepEqual((await repository.findUserPresenceAcrossRooms(userId, now))?.avatar, canonicalAccountAvatar)
    }
    assert.equal(await countRows(), rowsBefore, "presence reads never delete rows")
  } finally {
    await pool.query("DELETE FROM blumi_room_presence WHERE room_id = ANY($1::text[])", [[roomId, otherRoomId]])
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = ANY($1::text[])", [userIds])
    await pool.end()
  }
})

test("PostgreSQL presence writes with a stale or malformed cached avatar never change the account avatar", requirePostgres, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const suffix = randomUUID()
  const roomId = `presence_write_room_${suffix}`
  const userId = `presence_write_${suffix}`
  const repository = createPostgresPresenceRepository(pool)
  const now = new Date()
  const readAccountAvatar = async () => (await pool.query(
    "SELECT avatar_preset_id, avatar_selection, avatar_revision FROM blumi_accounts WHERE user_id = $1",
    [userId]
  )).rows[0]
  try {
    await seedAccount(pool, userId, now, canonicalAccountAvatar)
    const before = await readAccountAvatar()
    const malformedAvatar = { ...avatar, revision: "4" } as unknown as CompleteAvatarSelection
    for (const cachedAvatar of [avatar, { ...avatar, revision: canonicalAccountAvatar.revision + 1 }, malformedAvatar]) {
      await repository.savePresence({ ...makePresenceRecord(roomId, userId, now), avatar: cachedAvatar })
      assert.deepEqual(await readAccountAvatar(), before)
    }
    assert.deepEqual((await repository.findUserPresence(roomId, userId, now))?.avatar, canonicalAccountAvatar)
  } finally {
    await pool.query("DELETE FROM blumi_room_presence WHERE room_id = $1", [roomId])
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId])
    await pool.end()
  }
})

test("postgres presence repository rejects malformed stored avatar selections", async () => {
  const fake = createFakePool([
    { ...presenceRow, avatar_revision: "4" }
  ])

  await assert.rejects(
    createPostgresPresenceRepository(fake.pool).findUserPresence(
      "room_one",
      "user_one",
      new Date("2026-07-13T10:01:00.000Z")
    ),
    /Stored avatar selection is invalid/
  )
})

test("presence metadata writes ignore malformed cached avatars", async () => {
  const fake = createFakePool()
  const malformedAvatar = {
    ...avatar,
    revision: "4"
  } as unknown as CompleteAvatarSelection

  await createPostgresPresenceRepository(fake.pool).savePresence({
    roomId: "room_one",
    userId: "user_one",
    displayName: "Defne",
    avatar: malformedAvatar,
    spotId: "spot_one",
    inMiniRoom: false,
    joinedAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
    expiresAt: "2026-07-13T10:10:00.000Z"
  })
  assert.ok(fake.calls.some((call) => /INSERT INTO blumi_room_presence/i.test(call.text)))
})

test("postgres serializes concurrent spot reservations across independent pools", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const suffix = randomUUID()
  const firstPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: `presence-reserve-a-${suffix}`,
    max: 2
  })
  const secondPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: `presence-reserve-b-${suffix}`,
    max: 2
  })
  const firstRepository = createPostgresPresenceRepository(firstPool)
  const secondRepository = createPostgresPresenceRepository(secondPool)
  const roomId = `presence-concurrency-${randomUUID()}`
  const now = new Date()
  const makeRecord = (userId: string) => ({
    roomId,
    userId: `${userId}-${suffix}`,
    displayName: userId,
    avatar,
    spotId: "seat-shared",
    inMiniRoom: false,
    joinedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString()
  })

  try {
    const [firstClient, secondClient] = await Promise.all([
      firstPool.connect(),
      secondPool.connect()
    ])
    try {
      const [firstPid, secondPid] = await Promise.all([
        firstClient.query("SELECT pg_backend_pid() AS pid"),
        secondClient.query("SELECT pg_backend_pid() AS pid")
      ])
      assert.notEqual(firstPid.rows[0]?.pid, secondPid.rows[0]?.pid)
    } finally {
      firstClient.release()
      secondClient.release()
    }

    const results = await Promise.all([
      firstRepository.trySavePresence(makeRecord("presence-user-a"), now),
      secondRepository.trySavePresence(makeRecord("presence-user-b"), now)
    ])
    assert.equal(results.filter(Boolean).length, 1)

    const stored = await firstPool.query(
      "SELECT user_id, spot_id FROM blumi_room_presence WHERE room_id = $1",
      [roomId]
    )
    assert.equal(stored.rows.length, 1)
    assert.equal(stored.rows[0]?.spot_id, "seat-shared")
  } finally {
    await firstPool.query("DELETE FROM blumi_room_presence WHERE room_id = $1", [roomId])
    await Promise.all([firstPool.end(), secondPool.end()])
  }
})

test("postgres serializes a join reservation against a move into the same spot", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const roomId = `presence-join-move-${randomUUID()}`
  const setup = await createPresenceRaceHarness(roomId)
  const joinUserId = `presence-join-user-${randomUUID()}`
  const targetSpotId = "seat-shared"
  const joinRepository = createPostgresPresenceRepository(setup.firstPool)
  let joining: Promise<boolean> | undefined
  let moving: Promise<"moved" | "occupied" | "missing"> | undefined

  try {
    await seedPresence(
      setup.firstPool,
      makePresenceRecord(roomId, setup.userId, setup.now)
    )
    await seedAccount(setup.firstPool, joinUserId, setup.now)
    await holdRoomReservationLock(setup.blocker, roomId)

    // Both requests target the same spot from independent pools while another
    // transaction holds the room lock, making the overlap observable in PG.
    joining = joinRepository.trySavePresence({
      ...makePresenceRecord(roomId, joinUserId, setup.now),
      spotId: targetSpotId
    })
    moving = setup.presenceService.repository.tryMovePresence({
      roomId,
      userId: setup.userId,
      spotId: targetSpotId,
      updatedAt: setup.now.toISOString(),
      expiresAt: new Date(setup.now.getTime() + 60_000).toISOString()
    })

    const waitingPids = await waitForAdvisoryLockWaiters(
      setup.observerPool,
      [setup.firstApplicationName, setup.secondApplicationName]
    )
    assert.equal(waitingPids.size, 2, "both independent database sessions must wait on the room reservation lock")

    await setup.blocker.query("COMMIT")
    const [joinSaved, moveResult] = await Promise.all([joining, moving])
    const moveSucceeded = moveResult === "moved"
    assert.equal(Number(joinSaved) + Number(moveSucceeded), 1)
    assert.ok(moveResult === "moved" || moveResult === "occupied")

    const occupants = await setup.firstPool.query(
      `SELECT user_id
         FROM blumi_room_presence
        WHERE room_id = $1 AND spot_id = $2
          AND expires_at > clock_timestamp()`,
      [roomId, targetSpotId]
    )
    assert.equal(occupants.rows.length, 1, "the contested spot must have exactly one live occupant")
    assert.equal(
      String(occupants.rows[0]?.user_id),
      joinSaved ? joinUserId : setup.userId
    )
  } finally {
    await finishPresenceRaceHarness(
      setup,
      Promise.all([joining?.catch(() => false), moving?.catch(() => "missing")]),
      [joinUserId]
    )
  }
})

test("move cannot recreate presence deleted by a concurrent leave", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const setup = await createPresenceRaceHarness()
  const { firstPool, secondPool, observerPool, roomId, userId, now, blocker } = setup
  let moving: Promise<unknown> | undefined
  try {
    await seedPresence(firstPool, makePresenceRecord(roomId, userId, now))
    await holdRoomReservationLock(blocker, roomId)

    moving = setup.presenceService.moveToSpot(
      roomId,
      userId,
      "seat-right",
      now
    )
    await waitForAdvisoryLockWait(observerPool, setup.waitingBackendPid)
    await firstPool.query(
      "DELETE FROM blumi_room_presence WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    await blocker.query("COMMIT")

    await assert.rejects(moving, /join the room first/i)
    const remaining = await firstPool.query(
      "SELECT 1 FROM blumi_room_presence WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    assert.equal(remaining.rowCount, 0)
  } finally {
    await finishPresenceRaceHarness(setup, moving)
  }
})

test("move cannot recreate presence expired while waiting for its room lock", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const setup = await createPresenceRaceHarness()
  const { firstPool, observerPool, roomId, userId, now, blocker } = setup
  let moving: Promise<unknown> | undefined
  try {
    await seedPresence(firstPool, makePresenceRecord(roomId, userId, now))
    await holdRoomReservationLock(blocker, roomId)

    moving = setup.presenceService.moveToSpot(
      roomId,
      userId,
      "seat-right",
      now
    )
    await waitForAdvisoryLockWait(observerPool, setup.waitingBackendPid)
    await firstPool.query(
      "UPDATE blumi_room_presence SET expires_at = $3 WHERE room_id = $1 AND user_id = $2",
      [roomId, userId, new Date(now.getTime() - 1)]
    )
    await blocker.query("COMMIT")

    await assert.rejects(moving, /join the room first/i)
    const remaining = await firstPool.query(
      "SELECT 1 FROM blumi_room_presence WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    assert.equal(remaining.rowCount, 0)
  } finally {
    await finishPresenceRaceHarness(setup, moving)
  }
})

test("move cannot renew a lease that expires while waiting for the presence row lock", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const setup = await createPresenceRaceHarness()
  const { firstPool, observerPool, roomId, userId, now, blocker } = setup
  // The lease must still be live once the move is observed waiting on the row
  // lock. Harness setup, seeding and the lock wait can exceed 2 s when the
  // whole PostgreSQL gate runs back to back, so the window is 6 s.
  const leaseMs = 6_000
  const expiresAt = new Date(now.getTime() + leaseMs)
  let moving: Promise<unknown> | undefined
  try {
    await seedPresence(firstPool, makePresenceRecord(roomId, userId, now, false, leaseMs))
    await holdPresenceRowLock(blocker, roomId, userId)

    moving = setup.presenceService.moveToSpot(
      roomId,
      userId,
      "seat-right",
      now
    )
    await waitForStatementLockWait(
      observerPool,
      setup.waitingBackendPid,
      "FOR UPDATE"
    )
    assert.equal(await isBeforeDatabaseTime(observerPool, expiresAt), true)
    await waitUntilDatabaseTime(observerPool, expiresAt)
    await blocker.query("COMMIT")

    await assert.rejects(moving, /join the room first/i)
    const remaining = await firstPool.query(
      "SELECT 1 FROM blumi_room_presence WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    assert.equal(remaining.rowCount, 0)
  } finally {
    await finishPresenceRaceHarness(setup, moving)
  }
})

test("join preserves the latest in-mini-room value after reading stale presence", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const setup = await createPresenceRaceHarness()
  const { firstPool, observerPool, roomId, userId, now, blocker } = setup
  let joining: Promise<unknown> | undefined
  try {
    await seedPresence(firstPool, makePresenceRecord(roomId, userId, now, false))
    await holdRoomReservationLock(blocker, roomId)

    joining = setup.presenceService.joinRoom({
      roomId,
      profile: profileFor(userId),
      initialSpotId: "seat-left"
    }, now)
    await waitForAdvisoryLockWait(observerPool, setup.waitingBackendPid)
    await firstPool.query(
      "UPDATE blumi_room_presence SET in_mini_room = true WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    await blocker.query("COMMIT")
    await joining

    const saved = await firstPool.query(
      "SELECT in_mini_room FROM blumi_room_presence WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    assert.equal(saved.rows[0]?.in_mini_room, true)
  } finally {
    await finishPresenceRaceHarness(setup, joining)
  }
})

test("move preserves the latest in-mini-room value after reading stale presence", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const setup = await createPresenceRaceHarness()
  const { firstPool, observerPool, roomId, userId, now, blocker } = setup
  let moving: Promise<unknown> | undefined
  try {
    await seedPresence(firstPool, makePresenceRecord(roomId, userId, now, false))
    await holdRoomReservationLock(blocker, roomId)

    moving = setup.presenceService.moveToSpot(
      roomId,
      userId,
      "seat-right",
      now
    )
    await waitForAdvisoryLockWait(observerPool, setup.waitingBackendPid)
    await firstPool.query(
      "UPDATE blumi_room_presence SET in_mini_room = true WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    await blocker.query("COMMIT")
    await moving

    const saved = await firstPool.query(
      "SELECT in_mini_room, spot_id FROM blumi_room_presence WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    )
    assert.equal(saved.rows[0]?.in_mini_room, true)
    assert.equal(saved.rows[0]?.spot_id, "seat-right")
  } finally {
    await finishPresenceRaceHarness(setup, moving)
  }
})

test("join treats an upsert-conflicted lease as expired after its row-lock wait", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const setup = await createPresenceRaceHarness()
  const { firstPool, observerPool, roomId, userId, now, blocker } = setup
  const expiresAt = new Date(now.getTime() + 2_000)
  let joining: Promise<unknown> | undefined
  try {
    await seedPresence(firstPool, makePresenceRecord(roomId, userId, now, true, 2_000))
    await holdPresenceRowLock(blocker, roomId, userId)

    joining = setup.presenceService.joinRoom({
      roomId,
      profile: profileFor(userId),
      initialSpotId: "seat-left"
    }, now)
    await waitForStatementLockWait(
      observerPool,
      setup.waitingBackendPid,
      "INSERT INTO blumi_room_presence"
    )
    assert.equal(await isBeforeDatabaseTime(observerPool, expiresAt), true)
    await waitUntilDatabaseTime(observerPool, expiresAt)
    await blocker.query("COMMIT")
    await joining

    const saved = await firstPool.query(
      `SELECT in_mini_room, expires_at > clock_timestamp() AS lease_active
         FROM blumi_room_presence
        WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    )
    assert.equal(saved.rows[0]?.in_mini_room, false)
    assert.equal(saved.rows[0]?.lease_active, true)
  } finally {
    await finishPresenceRaceHarness(setup, joining)
  }
})

test("failed rollback destroys the PostgreSQL client instead of returning it healthy", async () => {
  const calls: string[] = []
  const releases: Array<Error | boolean | undefined> = []
  const originalError = new Error("injected reservation failure")
  const fakePool = {
    async query() {
      return { rows: [] }
    },
    async connect() {
      return {
        async query(text: string) {
          calls.push(text)
          if (text.includes("SELECT pg_advisory_xact_lock")) throw originalError
          if (text === "ROLLBACK") throw new Error("injected rollback failure")
          return { rows: [] }
        },
        release(error?: Error | boolean) {
          releases.push(error)
        }
      }
    }
  }

  await assert.rejects(
    createPostgresPresenceRepository(fakePool).trySavePresence(
      makePresenceRecord("room_rollback", "user_rollback", new Date())
    ),
    (error) => error === originalError
  )
  assert.ok(calls.includes("ROLLBACK"))
  assert.deepEqual(releases, [true])
})

interface PresenceRaceHarness {
  firstPool: pg.Pool
  secondPool: pg.Pool
  observerPool: pg.Pool
  firstApplicationName: string
  secondApplicationName: string
  waitingBackendPid: () => number | undefined
  roomId: string
  userId: string
  now: Date
  blocker: pg.PoolClient
  presenceService: ReturnType<typeof createPresenceService>
}

async function createPresenceRaceHarness(
  roomId = PUBLIC_LOBBY_ROOM_ID
): Promise<PresenceRaceHarness> {
  const suffix = randomUUID()
  const firstApplicationName = `presence-race-a-${suffix}`
  const secondApplicationName = `presence-race-b-${suffix}`
  const firstPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: firstApplicationName,
    max: 4
  })
  const secondPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: secondApplicationName,
    max: 4
  })
  const observerPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: `presence-race-observer-${suffix}`
  })
  const blocker = await firstPool.connect()
  let waitingBackendPid: number | undefined
  const transactionalPool = {
    query: secondPool.query.bind(secondPool),
    async connect() {
      const client = await secondPool.connect()
      const { rows } = await client.query("SELECT pg_backend_pid() AS pid")
      const pid = Number(rows[0]?.pid)
      return {
        query(text: string, values?: readonly unknown[]) {
          if (
            text.includes("pg_advisory_xact_lock") ||
            text.includes("FOR UPDATE") ||
            text.includes("INSERT INTO blumi_room_presence")
          ) {
            waitingBackendPid = pid
          }
          return client.query(text, values ? [...values] : undefined)
        },
        release(error?: Error | boolean) {
          client.release(error)
        }
      }
    }
  }
  return {
    firstPool,
    secondPool,
    observerPool,
    firstApplicationName,
    secondApplicationName,
    waitingBackendPid: () => waitingBackendPid,
    roomId,
    userId: `presence-race-user-${suffix}`,
    now: new Date(),
    blocker,
    presenceService: createPresenceService({
      repository: createPostgresPresenceRepository(transactionalPool),
      roomService: createRoomService()
    })
  }
}

function makePresenceRecord(
  roomId: string,
  userId: string,
  now: Date,
  inMiniRoom = false,
  leaseMs = 60_000
): PresenceRecord {
  return {
    roomId,
    userId,
    displayName: userId,
    avatar,
    spotId: "seat-left",
    inMiniRoom,
    joinedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + leaseMs).toISOString()
  }
}

function profileFor(userId: string) {
  return {
    userId,
    displayName: userId,
    avatar
  }
}

async function seedPresence(
  pool: pg.Pool,
  record: PresenceRecord
): Promise<void> {
  await seedAccount(pool, record.userId, new Date(record.joinedAt), record.avatar)
  await pool.query(
    `INSERT INTO blumi_room_presence (
       room_id, user_id, display_name, spot_id, in_mini_room,
       joined_at, updated_at, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.roomId,
      record.userId,
      record.displayName,
      record.spotId,
      record.inMiniRoom,
      record.joinedAt,
      record.updatedAt,
      record.expiresAt
    ]
  )
}

async function seedAccount(
  pool: pg.Pool,
  userId: string,
  createdAt: Date,
  accountAvatar: CompleteAvatarSelection = avatar
): Promise<void> {
  const suffix = userId.slice(-12)
  await pool.query(
    `INSERT INTO blumi_accounts (
       account_id, user_id, phone_number, avatar_preset_id,
       avatar_selection, avatar_revision, created_at, updated_at
     ) VALUES ($1, $1, $2, $3, $4::jsonb, $5, $6, $6)`,
    [
      userId,
      `+1555${suffix}`,
      accountAvatar.presetId,
      JSON.stringify(accountAvatar.loadout),
      accountAvatar.revision,
      createdAt.toISOString()
    ]
  )
}

async function holdRoomReservationLock(
  client: pg.PoolClient,
  roomId: string
): Promise<void> {
  await client.query("BEGIN")
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`blumi:room-presence:${roomId}`]
  )
}

async function holdPresenceRowLock(
  client: pg.PoolClient,
  roomId: string,
  userId: string
): Promise<void> {
  await client.query("BEGIN")
  await client.query(
    `SELECT user_id FROM blumi_room_presence
      WHERE room_id = $1 AND user_id = $2
      FOR UPDATE`,
    [roomId, userId]
  )
}

async function waitForAdvisoryLockWait(
  observerPool: pg.Pool,
  getWaitingBackendPid: () => number | undefined
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const pid = getWaitingBackendPid()
    if (pid === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      continue
    }
    const waiting = await observerPool.query(
      `SELECT pid FROM pg_stat_activity
        WHERE pid = $1
          AND wait_event_type = 'Lock'
          AND query LIKE '%pg_advisory_xact_lock%'`,
      [pid]
    )
    if (waiting.rowCount) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Reservation did not block on the held room advisory lock")
}

async function waitForAdvisoryLockWaiters(
  observerPool: pg.Pool,
  applicationNames: readonly string[]
): Promise<Set<number>> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const waiting = await observerPool.query(
      `SELECT pid, application_name
         FROM pg_stat_activity
        WHERE application_name = ANY($1::text[])
          AND wait_event_type = 'Lock'
          AND query LIKE '%pg_advisory_xact_lock%'`,
      [[...applicationNames]]
    )
    const observedApplications = new Set(
      waiting.rows.map((row) => String(row.application_name))
    )
    if (applicationNames.every((name) => observedApplications.has(name))) {
      return new Set(waiting.rows.map((row) => Number(row.pid)))
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Both independent reservations did not wait on the room advisory lock")
}

async function waitForStatementLockWait(
  observerPool: pg.Pool,
  getWaitingBackendPid: () => number | undefined,
  queryFragment: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const pid = getWaitingBackendPid()
    if (pid === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      continue
    }
    const waiting = await observerPool.query(
      `SELECT pid FROM pg_stat_activity
        WHERE pid = $1
          AND wait_event_type = 'Lock'
          AND query LIKE $2`,
      [pid, `%${queryFragment}%`]
    )
    if (waiting.rowCount) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Reservation did not block on a row lock in ${queryFragment}`)
}

async function isBeforeDatabaseTime(
  observerPool: pg.Pool,
  targetTime: Date
): Promise<boolean> {
  const result = await observerPool.query(
    "SELECT clock_timestamp() < $1::timestamptz AS before_target",
    [targetTime]
  )
  return Boolean(result.rows[0]?.before_target)
}

async function waitUntilDatabaseTime(
  observerPool: pg.Pool,
  targetTime: Date
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (!(await isBeforeDatabaseTime(observerPool, targetTime))) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Database clock did not reach the presence lease expiry")
}

async function finishPresenceRaceHarness(
  setup: PresenceRaceHarness,
  pending?: Promise<unknown>,
  additionalUserIds: readonly string[] = []
): Promise<void> {
  await setup.blocker.query("ROLLBACK").catch(() => undefined)
  setup.blocker.release()
  await pending?.catch(() => undefined)
  const userIds = [setup.userId, ...additionalUserIds]
  await setup.firstPool.query(
    "DELETE FROM blumi_room_presence WHERE room_id = $1 AND user_id = ANY($2::text[])",
    [setup.roomId, userIds]
  )
  await setup.firstPool.query(
    "DELETE FROM blumi_accounts WHERE user_id = ANY($1::text[])",
    [userIds]
  )
  await Promise.all([
    setup.firstPool.end(),
    setup.secondPool.end(),
    setup.observerPool.end()
  ])
}
