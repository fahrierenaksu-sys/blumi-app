import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-connections-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/persistence/accountScopedStorage.ts",
  "src/features/persistence/accountScopedStorage.test.ts",
  "src/features/connections/savedConnectionsPersistence.ts",
  "src/features/connections/savedConnectionsPersistence.test.ts",
  "src/features/connections/connectionDecisionOutbox.ts",
  "src/features/connections/connectionDecisionOutbox.test.ts",
  "src/features/connections/connectionDecisionApi.ts",
  "src/features/connections/connectionDecisionApi.test.ts",
  "src/features/connections/connectionDecisionDelivery.ts",
  "src/features/connections/connectionDecisionDelivery.test.ts",
  "src/features/connections/connectionMatchPresentation.ts",
  "src/features/connections/connectionMatchPresentation.test.ts",
  "src/features/connections/connectionMatchRuntime.ts",
  "src/features/connections/connectionMatchRuntime.test.ts",
  "src/features/connections/globalMatchReconciliation.ts",
  "src/features/connections/globalMatchReconciliation.test.ts"
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
      "--target", "ES2022",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--outDir", outputDirectory,
      "--rootDir", "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "features/persistence/accountScopedStorage.test.js"),
      join(outputDirectory, "features/connections/savedConnectionsPersistence.test.js"),
      join(outputDirectory, "features/connections/connectionDecisionOutbox.test.js"),
      join(outputDirectory, "features/connections/connectionDecisionApi.test.js"),
      join(outputDirectory, "features/connections/connectionDecisionDelivery.test.js"),
      join(outputDirectory, "features/connections/connectionMatchPresentation.test.js"),
      join(outputDirectory, "features/connections/connectionMatchRuntime.test.js"),
      join(outputDirectory, "features/connections/globalMatchReconciliation.test.js")
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
