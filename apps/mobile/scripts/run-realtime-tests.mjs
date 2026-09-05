import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-realtime-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []

try {
  execFileSync(process.execPath, [
    resolve(workspaceRoot, "../../node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "--ignoreDeprecations", "6.0",
    "--types", "node",
    "src/features/realtime/realtimeClient.ts",
    "src/features/realtime/realtimeClient.test.ts",
    "src/features/realtime/realtimeTicketApi.ts",
    "src/features/realtime/realtimeTicketApi.test.ts",
    "src/features/realtime/globalRealtimeEventHandler.ts",
    "src/features/realtime/globalRealtimeEventHandler.test.ts",
    "src/features/realtime/globalRealtimeLifecycle.ts",
    "src/features/realtime/globalRealtimeLifecycle.test.ts",
    "src/features/connections/connectionMatchRuntime.ts",
    "src/features/miniRoom/miniRoomMediaState.ts",
    "src/features/miniRoom/miniRoomMediaState.test.ts",
    "src/features/miniRoom/livekitRoomLifecycle.ts",
    "src/features/miniRoom/livekitRoomLifecycle.test.ts",
    "src/features/miniRoom/miniRoomCopy.ts",
    "src/features/miniRoom/miniRoomCopy.test.ts",
    "src/features/miniRoom/roomDebriefCopy.ts",
    "src/features/miniRoom/roomDebriefCopy.test.ts",
    "src/features/miniRoom/inRoomChatThread.ts",
    "src/features/miniRoom/inRoomChatThread.test.ts",
    "src/features/lobby/interactionState.ts",
    "src/features/lobby/lobbyState.ts",
    "src/features/lobby/lobbyState.test.ts",
    "src/features/lobby/publicLobby.ts",
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--outDir", outputDirectory,
    "--rootDir", "src",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--skipLibCheck"
  ], {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_PATH: resolve(workspaceRoot, "../../node_modules")
    }
  })

  execFileSync(process.execPath, [
    ...coverageArguments,
    "--test",
    join(outputDirectory, "features/realtime/realtimeClient.test.js"),
    join(outputDirectory, "features/realtime/realtimeTicketApi.test.js"),
    join(outputDirectory, "features/realtime/globalRealtimeEventHandler.test.js"),
    join(outputDirectory, "features/realtime/globalRealtimeLifecycle.test.js"),
    join(outputDirectory, "features/miniRoom/miniRoomMediaState.test.js"),
    join(outputDirectory, "features/miniRoom/livekitRoomLifecycle.test.js"),
    join(outputDirectory, "features/miniRoom/miniRoomCopy.test.js"),
    join(outputDirectory, "features/miniRoom/roomDebriefCopy.test.js"),
    join(outputDirectory, "features/miniRoom/inRoomChatThread.test.js"),
    join(outputDirectory, "features/lobby/lobbyState.test.js")
  ], {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_PATH: resolve(workspaceRoot, "../../node_modules")
    }
  })
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
