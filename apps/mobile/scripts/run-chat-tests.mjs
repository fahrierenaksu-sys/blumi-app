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
  "src/features/chat/inboxCopy.test.ts",
  "src/features/chat/matchChatOpening.ts",
  "src/features/chat/matchChatOpening.test.ts",
  "src/features/chat/chatStore.ts",
  "src/features/chat/chatStore.test.ts",
  "src/features/chat/chatRoomInviteApi.ts",
  "src/features/chat/chatRoomInviteApi.test.ts",
  "src/features/chat/chatRoomInviteModel.ts",
  "src/features/chat/chatRoomInviteModel.test.ts",
  "src/features/chat/chatCoordinator.ts",
  "src/features/chat/chatCoordinator.test.ts"
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
      join(outputDirectory, "features/chat/inboxCopy.test.js"),
      join(outputDirectory, "features/chat/matchChatOpening.test.js"),
      join(outputDirectory, "features/chat/chatStore.test.js"),
      join(outputDirectory, "features/chat/chatRoomInviteApi.test.js"),
      join(outputDirectory, "features/chat/chatRoomInviteModel.test.js"),
      join(outputDirectory, "features/chat/chatCoordinator.test.js")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: [
          resolve(workspaceRoot, "node_modules"),
          resolve(workspaceRoot, "../../node_modules"),
          process.env.NODE_PATH
        ].filter(Boolean).join(":")
      }
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
