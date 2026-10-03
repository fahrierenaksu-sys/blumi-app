import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as InviteHistory from "./chatRoomInvitePagingStore"

const OWNER = "synthetic-history-owner"
const THREAD = "synthetic-history-thread"

function setup() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof InviteHistory>("features/chat/chatRoomInvitePagingStore.ts", runtime)
  const latest = (inviteIds: readonly string[], nextCursor: string | null,
    extras: Partial<Parameters<typeof store.applyLatestRoomInvitePage>[0]> = {}) => {
    store.applyLatestRoomInvitePage({ userId: OWNER, threadId: THREAD, inviteIds,
      activeInviteIds: [], activeContextKnown: true, nextCursor, ...extras })
  }
  const read = () => store.getChatRoomInviteHistory(THREAD, OWNER)
  return { runtime, store, latest, read }
}

test("the selected invitation hook stays idle for identical pages and other conversations", () => {
  const { runtime, store, latest } = setup()
  latest(["synthetic-recent"], "synthetic-recent")
  const first = runtime.render(() => store.useChatRoomInviteHistory(THREAD, OWNER))
  const renders = runtime.renderCount
  latest(["synthetic-recent"], "synthetic-recent")
  latest(["synthetic-other"], null, { threadId: "synthetic-other-thread" })
  store.observeRoomInviteArrival(OWNER, "synthetic-other-thread", "synthetic-other-new")
  store.observeRoomInviteActiveContext(OWNER, "synthetic-other-thread", "synthetic-other-new", true)
  assert.equal(runtime.output, first)
  assert.equal(runtime.renderCount, renders, "unrelated invitation work does not render this chat")
  runtime.unmount()
})

test("reset and account replacement remove previous history from subscribed views", () => {
  const { runtime, store, latest, read } = setup()
  latest(["synthetic-private-history"], "synthetic-private-history", { activeInviteIds: ["synthetic-active"] })
  runtime.render(() => store.useChatRoomInviteHistory(THREAD, OWNER))
  store.resetChatRoomInviteHistory()
  assert.equal((runtime.output as InviteHistory.ChatRoomInviteHistory).ready, false)
  assert.deepEqual(read().historyInviteIds, [])
  latest(["synthetic-private-history"], "synthetic-private-history")
  latest(["synthetic-next-account"], null, { userId: "synthetic-next-owner" })
  assert.equal((runtime.output as InviteHistory.ChatRoomInviteHistory).ready, false)
  assert.deepEqual(read().activeInviteIds, [])
  assert.deepEqual(store.getChatRoomInviteHistory(THREAD, "synthetic-next-owner").historyInviteIds, ["synthetic-next-account"])
  assert.equal(store.getChatRoomInviteHistory(undefined, "synthetic-next-owner").ready, false)
  runtime.unmount()
})

test("a late older reply cannot restore history after account replacement or reset", () => {
  const { store, latest } = setup()
  latest(["synthetic-cursor"], "synthetic-cursor")
  latest(["synthetic-new-owner-row"], "synthetic-new-owner-row", { userId: "synthetic-next-owner" })
  const current = store.getChatRoomInviteHistory(THREAD, "synthetic-next-owner")
  assert.equal(store.applyOlderRoomInvitePage({ userId: OWNER, threadId: THREAD, before: "synthetic-cursor",
    inviteIds: ["synthetic-late-old"], nextCursor: null }), false)
  assert.equal(store.getChatRoomInviteHistory(THREAD, "synthetic-next-owner"), current)
  store.resetChatRoomInviteHistory()
  assert.equal(store.applyOlderRoomInvitePage({ userId: "synthetic-next-owner", threadId: THREAD, before: "synthetic-new-owner-row",
    inviteIds: ["synthetic-late-next"], nextCursor: null }), false)
  assert.equal(store.getChatRoomInviteHistory(THREAD, "synthetic-next-owner").ready, false)
})

test("overlapping refreshes preserve loaded older pages while disconnected refreshes reject late paging", () => {
  const { store, latest, read } = setup()
  latest(["synthetic-20", "synthetic-21"], "synthetic-20")
  assert.equal(store.applyOlderRoomInvitePage({ userId: OWNER, threadId: THREAD, before: "synthetic-20",
    inviteIds: ["synthetic-18", "synthetic-19"], nextCursor: "synthetic-18" }), true)
  latest(["synthetic-21", "synthetic-22"], "synthetic-21")
  assert.deepEqual(new Set(read().historyInviteIds), new Set(["synthetic-18", "synthetic-19", "synthetic-20", "synthetic-21", "synthetic-22"]))
  assert.equal(read().nextCursor, "synthetic-18", "refresh cannot skip a still-connected older boundary")
  const unchanged = read()
  latest(["synthetic-21", "synthetic-22"], "synthetic-21")
  assert.equal(read(), unchanged)
  latest(["synthetic-81", "synthetic-82"], "synthetic-81")
  assert.deepEqual(read().historyInviteIds, ["synthetic-81", "synthetic-82"])
  assert.equal(read().nextCursor, "synthetic-81")
  const replaced = read()
  assert.equal(store.applyOlderRoomInvitePage({ userId: OWNER, threadId: THREAD, before: "synthetic-18",
    inviteIds: ["synthetic-gap-old"], nextCursor: null }), false)
  assert.equal(read(), replaced)
})

test("a realtime arrival does not pretend that the user loaded an older page", () => {
  const { store, latest, read } = setup()
  latest(["synthetic-20", "synthetic-21"], "synthetic-20")
  store.observeRoomInviteArrival(OWNER, THREAD, "synthetic-22")
  assert.equal(read().nextCursor, "synthetic-20")
  latest(["synthetic-21", "synthetic-22"], "synthetic-21")
  assert.equal(read().nextCursor, "synthetic-21", "latest server page supplies the cursor until an explicit older page is loaded")
  assert.ok(read().historyInviteIds.includes("synthetic-22"), "a live invitation is immediately eligible for presentation")
})

test("active extras and an exact target context cannot move the historical cursor or release old hidden history", () => {
  const { store, latest, read } = setup()
  latest(["synthetic-recent"], "synthetic-recent", { activeInviteIds: ["synthetic-old-live"] })
  assert.deepEqual(read().historyInviteIds, ["synthetic-recent"])
  assert.deepEqual(read().latestInviteIds, ["synthetic-recent"])
  store.observeRoomInviteActiveContext(OWNER, THREAD, "synthetic-exact-target", true)
  assert.deepEqual(read().activeInviteIds, ["synthetic-old-live", "synthetic-exact-target"])
  assert.deepEqual(read().historyInviteIds, ["synthetic-recent"])
  assert.equal(read().nextCursor, "synthetic-recent")
  store.observeRoomInviteActiveContext(OWNER, THREAD, "synthetic-old-live", false)
  store.observeRoomInviteActiveContext(OWNER, THREAD, "synthetic-exact-target", false)
  assert.deepEqual(read().activeInviteIds, [])
  assert.deepEqual(read().historyInviteIds, ["synthetic-recent"], "ending an old room only removes action context")
  assert.equal(read().nextCursor, "synthetic-recent")
})

test("duplicate arrivals and unchanged active statuses keep the selected snapshot stable", () => {
  const { runtime, store, latest, read } = setup()
  latest(["synthetic-recent"], null, { activeInviteIds: ["synthetic-current"] })
  const initial = runtime.render(() => store.useChatRoomInviteHistory(THREAD, OWNER))
  const renders = runtime.renderCount
  store.observeRoomInviteArrival(OWNER, THREAD, "synthetic-recent")
  store.observeRoomInviteActiveContext(OWNER, THREAD, "synthetic-current", true)
  store.observeRoomInviteActiveContext(OWNER, THREAD, "synthetic-archived-declined", false)
  assert.equal(read(), initial)
  assert.equal(runtime.renderCount, renders)
  store.observeRoomInviteActiveContext(OWNER, THREAD, "synthetic-current", false)
  assert.deepEqual((runtime.output as InviteHistory.ChatRoomInviteHistory).activeInviteIds, [])
  assert.deepEqual(read().historyInviteIds, ["synthetic-recent"])
  runtime.unmount()
})

test("a confirmed empty older page finishes paging without inventing rows from cached history", () => {
  const { store, latest, read } = setup()
  latest(["synthetic-recent"], "synthetic-recent")
  assert.equal(store.applyOlderRoomInvitePage({ userId: OWNER, threadId: THREAD, before: "synthetic-recent",
    inviteIds: [], nextCursor: null }), true)
  assert.deepEqual(read().historyInviteIds, ["synthetic-recent"])
  assert.deepEqual(read().lastOlderPage, { before: "synthetic-recent", inviteIds: [] })
  assert.equal(read().nextCursor, null)
  const terminal = read()
  assert.equal(store.applyOlderRoomInvitePage({ userId: OWNER, threadId: THREAD, before: "synthetic-recent",
    inviteIds: ["synthetic-duplicate-late"], nextCursor: null }), false)
  assert.equal(read(), terminal)
})
