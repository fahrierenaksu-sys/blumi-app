import { execFileSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const workspaceRoot = resolve(new URL("..", import.meta.url).pathname)
const repositoryRoot = resolve(workspaceRoot, "../..")
const distDirectory = join(workspaceRoot, "dist")

execFileSync("npm", ["run", "build", "-w", "@blumi/domain"], {
  cwd: repositoryRoot,
  stdio: "inherit"
})

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

function findTestFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry)
      return statSync(path).isDirectory() ? findTestFiles(path) : [path]
    })
    .filter((path) => path.endsWith(".test.js"))
    .sort()
}
