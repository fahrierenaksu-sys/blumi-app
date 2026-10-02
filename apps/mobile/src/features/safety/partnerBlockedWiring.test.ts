import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as BlockStore from "./blockStore"
import * as partnerBlockedEvents from "./partnerBlockedEvents"
import type { PartnerBlockedEvent } from "./partnerBlockedEvents"

// Every block is announced with its owner, and the chat cleanup of the
// signed-in account reacts only to its own owner's blocks.

function loadBlockStore() {
  return loadSourceWithFakeReact<typeof BlockStore>("features/safety/blockStore.ts", createFakeReactRuntime(), {
    modules: {
      "@react-native-async-storage/async-storage": { setItem: async () => undefined },
      "../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" },
      "../persistence/accountScopedStorage": {
        loadAccountScopedStorage: async () => ({ status: "ready", rawValues: [null] })
      },
      "./safetyApi": { fetchSafetyBlocks: async () => [] },
      "./partnerBlockedEvents": partnerBlockedEvents
    },
    real: ["./blockScopeModel"]
  })
}

test("blocking a user announces the owner and the blocked user", () => {
  const store = loadBlockStore()
  const heard: PartnerBlockedEvent[] = []
  const unsubscribe = partnerBlockedEvents.subscribeToPartnerBlocked((event) => { heard.push(event) })
  store.blockUser("owner-a", "bora", { persist: false })
  unsubscribe()
  assert.equal(heard.length, 1)
  assert.equal(heard[0]!.blockedUserId, "bora")
  assert.ok(heard[0]!.ownerUserId.includes("owner-a"))
})

test("chat cleanup applies only the signed-in owner's blocks, and stops on unmount", () => {
  const runtime = createFakeReactRuntime()
  const applied: string[] = []
  const { useBlockedPartnerCleanup } = loadSourceWithFakeReact<{
    useBlockedPartnerCleanup: (userId: string | undefined) => (blockedUserId: string) => void
  }>("navigation/useBlockedPartnerCleanup.ts", runtime, {
    modules: {
      "@react-navigation/native": { StackActions: { replace: () => ({}) } },
      "../features/chat/chatStore": { removeChatThreadsWithPartner: () => undefined },
      "../features/safety/partnerBlockedEvents": partnerBlockedEvents,
      "./blockedPartnerChatExit": {
        applyBlockedPartnerToChat: ({ blockedUserId }: { blockedUserId: string }) => { applied.push(blockedUserId) }
      },
      "./nativeSheets/rootRouteBeneathSheets": {
        getRootRouteBeneathSheets: () => undefined,
        popRootRouteBeneathSheets: () => undefined
      },
      "./rootNavigationRef": { navigationRef: { isReady: () => false } }
    }
  })
  runtime.render(() => useBlockedPartnerCleanup("ada"))

  partnerBlockedEvents.publishPartnerBlocked({ ownerUserId: "someone-else", blockedUserId: "cem" })
  assert.deepEqual(applied, [], "another account's block never touches this chat")
  partnerBlockedEvents.publishPartnerBlocked({ ownerUserId: "ada", blockedUserId: "bora" })
  assert.deepEqual(applied, ["bora"])

  runtime.unmount()
  partnerBlockedEvents.publishPartnerBlocked({ ownerUserId: "ada", blockedUserId: "deniz" })
  assert.deepEqual(applied, ["bora"])
})
