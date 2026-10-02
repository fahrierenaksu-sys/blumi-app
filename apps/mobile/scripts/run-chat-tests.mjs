import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-chat-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/chat/chatApi.ts",
  "src/features/chat/chatApi.test.ts",
  "src/features/chat/chatSchemas.ts",
  "src/features/chat/chatSchemas.test.ts",
  "src/features/chat/chatParticipantAvatar.ts",
  "src/features/chat/chatParticipantAvatar.test.ts",
  "src/features/chat/chatErrorCopy.ts",
  "src/features/chat/chatErrorCopy.test.ts",
  "src/features/chat/inboxCopy.ts",
  "src/features/inbox/inboxEntranceModel.ts",
  "src/features/inbox/inboxEntranceModel.test.ts",
  "src/features/inbox/inboxUnreadPulseModel.ts",
  "src/features/inbox/inboxUnreadPulseModel.test.ts",
  "src/features/inbox/inboxPullRefreshModel.ts",
  "src/features/inbox/inboxPullRefreshModel.test.ts",
  "src/features/inbox/inboxRowModel.ts",
  "src/features/inbox/inboxRowModel.test.ts",
  "src/features/inbox/inboxConversationPrefsModel.ts",
  "src/features/inbox/inboxConversationPrefsModel.test.ts",
  "src/features/chat/matchChatOpening.ts",
  "src/features/chat/matchChatOpening.test.ts",
  "src/features/chat/chatStore.ts",
  "src/features/chat/chatMessageRenderKeys.ts",
  "src/features/chat/chatReadHere.ts",
  "src/features/chat/chatPartnerReceiptsState.ts",
  "src/features/chat/chatStore.test.ts",
  "src/features/chat/chatStore.adversarial.test.ts",
  "src/features/chat/chatRoomInviteApi.ts",
  "src/features/chat/chatRoomInviteApi.test.ts",
  "src/features/chat/chatRoomInviteModel.ts",
  "src/features/chat/chatRoomInviteModel.test.ts",
  "src/features/chat/chatRoomInviteCardModel.ts",
  "src/features/chat/chatRoomInviteCardModel.test.ts",
  "src/features/chat/chatCoordinator.ts",
  "src/features/chat/chatCoordinator.test.ts",
  "src/features/chat/threadListRefreshGuard.ts",
  "src/features/chat/threadListRefreshGuard.test.ts",
  "src/features/chat/thread/chatThreadCopy.ts",
  "src/features/chat/thread/chatThreadCopy.test.ts",
  "src/features/chat/thread/chatThreadModel.ts",
  "src/features/chat/thread/chatThreadModel.test.ts",
  "src/features/chat/thread/chatTimelineEntranceModel.ts",
  "src/features/chat/thread/chatTimelineEntranceModel.test.ts",
  "src/features/chat/thread/chatBubbleAccessibility.ts",
  "src/features/chat/thread/chatBubbleAccessibility.test.ts",
  "src/features/chat/chatReceiptModel.ts",
  "src/features/chat/chatReceiptModel.test.ts",
  "src/features/chat/chatDeliveryAckBatcher.ts",
  "src/features/chat/chatDeliveryAckBatcher.test.ts",
  "src/features/chat/typing/chatTypingModel.ts",
  "src/features/chat/typing/chatTypingModel.test.ts",
  "src/features/chat/typing/chatTypingStore.ts",
  "src/features/chat/typing/chatTypingStore.test.ts",
  "src/features/chat/typing/chatTypingCopy.ts",
  "src/features/chat/thread/chatScrollToLatestModel.ts",
  "src/features/chat/thread/chatScrollToLatestModel.test.ts"
]

try {
  execFileSync(
    process.execPath,
    [
      resolve(workspaceRoot, "../../node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--ignoreDeprecations", "6.0",
      "--types", "node",
      ...sourceFiles,
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "features/chat/chatApi.test.js"),
      join(outputDirectory, "features/chat/chatSchemas.test.js"),
      join(outputDirectory, "features/chat/chatParticipantAvatar.test.js"),
      join(outputDirectory, "features/chat/chatErrorCopy.test.js"),
      join(outputDirectory, "features/inbox/inboxEntranceModel.test.js"),
      join(outputDirectory, "features/inbox/inboxUnreadPulseModel.test.js"),
      join(outputDirectory, "features/inbox/inboxPullRefreshModel.test.js"),
      join(outputDirectory, "features/inbox/inboxRowModel.test.js"),
      join(outputDirectory, "features/inbox/inboxConversationPrefsModel.test.js"),
      join(outputDirectory, "features/chat/matchChatOpening.test.js"),
      join(outputDirectory, "features/chat/chatStore.test.js"),
      join(outputDirectory, "features/chat/chatStore.adversarial.test.js"),
      join(outputDirectory, "features/chat/chatRoomInviteApi.test.js"),
      join(outputDirectory, "features/chat/chatRoomInviteModel.test.js"),
      join(outputDirectory, "features/chat/chatRoomInviteCardModel.test.js"),
      join(outputDirectory, "features/chat/chatCoordinator.test.js"),
      join(outputDirectory, "features/chat/threadListRefreshGuard.test.js"),
      join(outputDirectory, "features/chat/thread/chatThreadCopy.test.js"),
      join(outputDirectory, "features/chat/thread/chatThreadModel.test.js"),
      join(outputDirectory, "features/chat/thread/chatTimelineEntranceModel.test.js"),
      join(outputDirectory, "features/chat/thread/chatBubbleAccessibility.test.js"),
      join(outputDirectory, "features/chat/chatReceiptModel.test.js"),
      join(outputDirectory, "features/chat/chatDeliveryAckBatcher.test.js"),
      join(outputDirectory, "features/chat/typing/chatTypingModel.test.js"),
      join(outputDirectory, "features/chat/typing/chatTypingStore.test.js"),
      join(outputDirectory, "features/chat/thread/chatScrollToLatestModel.test.js"),
      resolve(workspaceRoot, "src/screens/ChatThreadScreen.test.mjs"),
      resolve(workspaceRoot, "src/screens/InboxScreen.test.mjs")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        // Store and coordinator tests assert the default English copy while
        // production resolves the device locale. Pin the ICU locale so a
        // Turkish Mac and an English CI runner produce the same result;
        // chatErrorCopy.test.ts checks both locales explicitly.
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        NODE_PATH: [
          resolve(workspaceRoot, "node_modules"),
          resolve(workspaceRoot, "../../node_modules"),
          process.env.NODE_PATH
        ].filter(Boolean).join(":")
      }
    }
  )

  // Hook lifecycle tests read production sources through the hook harness.
  execFileSync(
    process.execPath,
    ["--import", "tsx", "--test", "src/features/chat/useChatStore.test.ts", "src/features/chat/thread/useChatThreadSync.test.ts", "src/features/chat/typing/useChatDraftTyping.test.ts", "src/features/inbox/useInboxClock.test.ts", "src/features/inbox/inboxConversationPrefsStore.test.ts"],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
