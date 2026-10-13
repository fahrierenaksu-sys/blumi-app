const { readdirSync, readFileSync } = require("node:fs")
const { extname, join, relative, resolve } = require("node:path")

const RUNTIME_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"])
const CANDIDATE_IMPORT = /\b(?:require\s*\(\s*|from\s*|import\s*)(["'])([^"']*(?:-candidate|candidate)s?\/[^"']+)\1/g

function findCandidateAssetImports(sources) {
  const references = []
  for (const source of sources) {
    CANDIDATE_IMPORT.lastIndex = 0
    for (const match of source.content.matchAll(CANDIDATE_IMPORT)) {
      references.push({ filePath: source.filePath, assetPath: match[2] })
    }
  }
  return references
}

function assertNoCandidateAssetImportsInSourceRoot(sourceRoot) {
  const root = resolve(sourceRoot)
  const sources = collectRuntimeSources(root)
  const references = findCandidateAssetImports(sources)
  if (references.length === 0) return

  const byFile = new Map()
  for (const reference of references) {
    const filePath = relative(root, reference.filePath).split("\\").join("/")
    byFile.set(filePath, (byFile.get(filePath) ?? 0) + 1)
  }
  const details = [...byFile]
    .map(([filePath, count]) => `${filePath} (${count})`)
    .join(", ")
  throw new Error(
    `Preview and production builds cannot include candidate asset imports. ` +
    `Promote reviewed assets into approved runtime paths or remove the imports: ${details}`
  )
}

/**
 * Front (showcase) looks are baked with `ownerApproved` per body (tools/avatar25d/showcase-baked.json). A work branch
 * may bake a look the owner has not approved yet (bake-showcase.mjs --pending-owner-approval) so he can review it in a
 * development build; the TestFlight workflows refuse it before building. A missing file or body list means no front art.
 */
function findShowcaseBodiesPendingOwnerApproval(baked) {
  const bodies = baked && typeof baked === "object" && baked.bodies && typeof baked.bodies === "object" ? baked.bodies : {}
  return Object.entries(bodies)
    .filter(([, body]) => body?.ownerApproved !== true)
    .map(([rig]) => rig)
}

function assertShowcaseLooksOwnerApproved(bakedPath) {
  let baked
  try {
    baked = JSON.parse(readFileSync(bakedPath, "utf8"))
  } catch (error) {
    if (error && error.code === "ENOENT") return
    throw new Error(`Cannot read the showcase bake at ${bakedPath}: ${error.message}`)
  }
  const pending = findShowcaseBodiesPendingOwnerApproval(baked)
  if (pending.length === 0) return
  throw new Error(
    `Release builds cannot ship front (showcase) looks the owner has not approved: ${pending.join(", ")}. ` +
    `Set ownerApproved in tools/avatar25d/showcase-allowlist.json after his yes and re-bake, or bake without them.`
  )
}

function collectRuntimeSources(sourceRoot) {
  const sources = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(filePath)
        continue
      }
      const extension = extname(entry.name)
      if (
        !entry.isFile() ||
        !RUNTIME_SOURCE_EXTENSIONS.has(extension) ||
        /\.(?:test|spec)\.[^.]+$/.test(entry.name) ||
        entry.name.endsWith(".d.ts")
      ) {
        continue
      }
      sources.push({ filePath, content: readFileSync(filePath, "utf8") })
    }
  }
  visit(sourceRoot)
  return sources
}

module.exports = {
  assertNoCandidateAssetImportsInSourceRoot,
  assertShowcaseLooksOwnerApproved,
  findShowcaseBodiesPendingOwnerApproval,
  findCandidateAssetImports
}
