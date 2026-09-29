import { execFileSync } from "node:child_process"
import { readdirSync, rmSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const workspaceRoot = resolve(new URL("..", import.meta.url).pathname)
const repositoryRoot = resolve(workspaceRoot, "../..")
const distDirectory = join(workspaceRoot, "dist")

for (const workspace of ["@blumi/contracts", "@blumi/domain"]) {
  execFileSync("npm", ["run", "build", "-w", workspace], {
    cwd: repositoryRoot,
    stdio: "inherit"
  })
}

// Compiled tests of deleted sources must not survive in dist and keep running.
rmSync(distDirectory, { recursive: true, force: true })

execFileSync("npm", ["run", "build"], {
  cwd: workspaceRoot,
  stdio: "inherit"
})

const testFiles = findTestFiles(distDirectory)
if (testFiles.length === 0) {
  throw new Error("No server test files found in dist.")
}

execFileSync(process.execPath, ["--test", ...testFiles], {
  cwd: workspaceRoot,
  stdio: "inherit"
})

// The legal-page builder consumes maintained mobile legal sources outside src.
execFileSync(process.execPath, [
  "--import", "tsx",
  "--test",
  "apps/mobile/src/features/legal/legalCopy.test.ts",
  "apps/mobile/src/features/legal/legalPolicyMetadata.test.ts",
  "apps/mobile/src/features/legal/legalDocumentModel.test.ts"
], {
  cwd: repositoryRoot,
  stdio: "inherit"
})

function findTestFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry)
      return statSync(path).isDirectory() ? findTestFiles(path) : [path]
    })
    .filter((path) => path.endsWith(".test.js"))
    .sort()
}
