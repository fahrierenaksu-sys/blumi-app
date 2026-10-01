import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as ChatStore from "./chatStore"
import type * as Identity from "./useLiveParticipantIdentity"
import type * as LiveMatch from "../matches/useLiveMatchParticipant"

function mount() {
  const runtime = createFakeReactRuntime()
  const store = loadSourceWithFakeReact<typeof ChatStore>("features/chat/chatStore.ts", runtime, {
    real: ["./chatErrorCopy", "./chatReceiptModel", "./chatMessageRenderKeys", "./chatReadHere", "./chatPartnerReceiptsState", "./chatParticipantUpdates"]
  })
  store.resetChatStore()
  const hooks = loadSourceWithFakeReact<typeof Identity>("features/chat/useLiveParticipantIdentity.ts", runtime, {
    modules: { "./chatStore": store, "../avatarV2/candidateAvatarSnapshot": {
      createCandidateAvatarSnapshot: (input: Record<string, unknown>) => ({ ...input.avatarSnapshot as object, ...input })
    } }, real: ["./chatParticipantUpdates", "./liveParticipantIdentityModel"]
  })
  const matchHooks = loadSourceWithFakeReact<typeof LiveMatch>("features/matches/useLiveMatchParticipant.ts", runtime, {
    modules: { "../chat/useLiveParticipantIdentity": hooks }, real: ["../chat/liveParticipantIdentityModel"]
  })
  return { runtime, store, hooks, matchHooks }
}

test("an already open route refreshes on name and outfit events and drops overlays on account reset", () => {
  const f = mount()
  const fallback = { userId: "partner", displayName: "Eren", context: "room" }
  f.runtime.render(() => f.hooks.useLiveParticipantIdentity(fallback))
  const avatar = { presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
    loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds] }, revision: 2 }
  f.store.applyChatParticipantUpdated({ participant: { userId: "partner", displayName: "Irmak", avatar }, updatedAt: "2026-10-01T11:00:00Z" })
  const current = f.runtime.output as typeof fallback & { avatarSnapshot: { avatarSelection: typeof avatar } }
  assert.equal(current.displayName, "Irmak")
  assert.equal(current.avatarSnapshot.avatarSelection.revision, 2)
  assert.equal(current.context, "room")
  assert.deepEqual(f.store.getThreads(), [], "display metadata cannot invent chat access")
  f.store.resetChatStore()
  assert.equal(f.runtime.output, fallback)
  f.runtime.unmount()
})

test("unrelated messages and participant updates do not rerender a person's identity", () => {
  const f = mount()
  f.runtime.render(() => f.hooks.useChatParticipant("partner"))
  f.store.applyChatParticipantUpdated({ participant: { userId: "partner", displayName: "Irmak" }, updatedAt: "2026-10-01T11:00:00Z" })
  const before = f.runtime.renderCount
  const snapshot = f.runtime.output
  f.store.applyChatParticipantUpdated({ participant: { userId: "other", displayName: "Other" }, updatedAt: "2026-10-01T11:00:00Z" })
  f.store.applyChatMessageReceived({ threadId: "other-thread", messageId: "message", senderUserId: "other", body: "hello", sentAt: "2026-10-01T11:00:00Z" })
  assert.equal(f.runtime.renderCount, before)
  assert.equal(f.runtime.output, snapshot)
  assert.ok(Object.isFrozen(snapshot))
  f.runtime.unmount()
})

test("an open match keeps its context while its partner name and avatar update", () => {
  const f = mount()
  const participant = { userId: "partner", displayName: "Eren", avatarPresetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId }
  f.runtime.render(() => f.matchHooks.useLiveMatchParticipant(participant))
  f.store.applyChatParticipantUpdated({ participant: { userId: "partner", displayName: "Irmak", avatar: {
    presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
    loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds] }, revision: 3
  } }, updatedAt: "2026-10-01T12:00:00Z" })
  const current = f.runtime.output as NonNullable<ReturnType<typeof f.matchHooks.useLiveMatchParticipant>>
  assert.equal(current.userId, "partner")
  assert.equal(current.displayName, "Irmak")
  assert.equal(current.avatarSelection?.revision, 3)
  f.runtime.unmount()
})

test("a fresh room rejoin snapshot wins over an older live cache", () => {
  const f = mount()
  f.store.applyChatParticipantUpdated({ participant: { userId: "partner", displayName: "Eren" }, updatedAt: "2026-10-01T11:00:00Z" })
  const rejoined = { userId: "partner", displayName: "Irmak", profileUpdatedAt: "2026-10-01T12:00:00Z" }
  f.runtime.render(() => f.hooks.useLiveParticipantIdentity(rejoined))
  assert.equal((f.runtime.output as typeof rejoined).displayName, "Irmak")
  f.runtime.unmount()
})
