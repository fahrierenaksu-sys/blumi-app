import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcRoot = join(mobileRoot, "src")
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/

function toPosix(path) {
  return path.split(sep).join("/")
}

function listSourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
    } else if (SOURCE_EXTENSION.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

// Every import/export-from/require/dynamic import specifier, type-only
// imports included.
function readSpecifiers(file) {
  const info = ts.preProcessFile(readFileSync(file, "utf8"), true, true)
  return info.importedFiles.map((entry) => entry.fileName)
}

// Repo-relative path (without extension) of a relative specifier, or undefined
// for packages and other non-relative specifiers.
function resolveInternalTarget(file, specifier) {
  if (!specifier.startsWith(".")) return undefined
  const target = resolve(dirname(file), specifier)
  const path = toPosix(relative(mobileRoot, target))
  return path.replace(SOURCE_EXTENSION, "")
}

function collectImports(area) {
  const edges = []
  for (const file of listSourceFiles(join(srcRoot, area))) {
    for (const specifier of readSpecifiers(file)) {
      const target = resolveInternalTarget(file, specifier)
      if (target) {
        edges.push({ from: toPosix(relative(mobileRoot, file)), to: target })
      }
    }
  }
  return edges
}

function importsInto(edges, layer) {
  return edges.filter((edge) => edge.to === `src/${layer}` || edge.to.startsWith(`src/${layer}/`))
}

function describe(edges) {
  return edges.map((edge) => `${edge.from} -> ${edge.to}`).sort()
}

test("src/config does not import features, screens or navigation", () => {
  const edges = collectImports("config")
  for (const layer of ["features", "screens", "navigation"]) {
    assert.deepEqual(describe(importsInto(edges, layer)), [], `config -> ${layer}`)
  }
})

test("src/ui does not import screens or navigation", () => {
  const edges = collectImports("ui")
  for (const layer of ["screens", "navigation"]) {
    assert.deepEqual(describe(importsInto(edges, layer)), [], `ui -> ${layer}`)
  }
})

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/

// The shared room renders only the server-accepted shared decor (or the
// explicit default), never the viewer's personal local room.
test("the shared room never reads the viewer's personal room state or storage", () => {
  const edges = collectImports("").filter((edge) =>
    !TEST_FILE.test(edge.from) &&
    (edge.from.startsWith("src/features/miniRoom/") || edge.from === "src/screens/MiniRoomScreen.tsx")
  )
  const offenders = edges.filter((edge) =>
    edge.to === "src/features/roomV2/state/RoomV2Provider" ||
    edge.to === "src/features/roomV2/roomV2Persistence"
  )
  assert.deepEqual(describe(offenders), [], "use resolveSharedRoomDecor for the shared room")
})

// Home Studio QA bitmaps and candidate assets must never reach the production
// or preview graph. Only the QA feature itself may import them, and the QA
// screen is reachable only through the Metro-routed live module.
test("Home Studio QA bindings and screen stay behind the QA module routing", () => {
  const edges = collectImports("").filter((edge) => !TEST_FILE.test(edge.from))
  const qaAssetOffenders = edges.filter((edge) =>
    (edge.to === "src/features/roomStudio/roomStudioQaAssetBindings" ||
      edge.to.startsWith("src/features/roomStudio/assets/qa/")) &&
    !edge.from.startsWith("src/features/roomStudio/") &&
    edge.from !== "src/screens/HomeStudioScreen.tsx"
  )
  assert.deepEqual(describe(qaAssetOffenders), [], "QA bitmaps stay inside the Home Studio QA feature")

  const screenOffenders = edges.filter((edge) =>
    edge.to === "src/screens/HomeStudioScreen" &&
    !edge.from.startsWith("src/features/roomStudio/homeStudioQaLiveModule/")
  )
  assert.deepEqual(describe(screenOffenders), [], "import Home Studio through @blumi/home-studio-qa")
})
