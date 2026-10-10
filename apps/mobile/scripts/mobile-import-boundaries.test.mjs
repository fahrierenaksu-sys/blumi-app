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

// Review A F2: six room modules read the room seam once, when they load. The app must fill it first, so the
// install is App.tsx's first import, App.tsx is the only entry (index.js imports expo and ./App only), nothing
// else installs it, and the install's own import graph reaches none of the modules that read it.
test("the room seam is installed by the first import of the only app entry, before any module that reads it", () => {
  const install = "src/features/avatar/roomAvatarSeamInstall"
  const appSpecifiers = readSpecifiers(join(mobileRoot, "App.tsx"))
  assert.equal(appSpecifiers[0], `./${install}`, "App.tsx installs the room seam first")
  assert.deepEqual(readSpecifiers(join(mobileRoot, "index.js")).sort(), ["./App", "expo"])

  const edges = collectImports("")
  const installers = edges.filter((edge) => edge.to === install && !TEST_FILE.test(edge.from))
  assert.deepEqual(describe(installers), [], "only App.tsx installs the room seam")

  const withoutExtension = (path) => path.replace(SOURCE_EXTENSION, "")
  const next = new Map()
  for (const edge of edges) {
    const from = withoutExtension(edge.from)
    next.set(from, [...(next.get(from) ?? []), edge.to])
  }
  const reached = new Set([install])
  const queue = [install]
  while (queue.length > 0) {
    for (const target of next.get(queue.pop()) ?? []) {
      const key = withoutExtension(target)
      if (reached.has(key)) continue
      reached.add(key)
      queue.push(key)
    }
  }
  // the walk is real: the install does load the layered furniture catalog
  assert.ok(reached.has("src/features/roomV2/furniture/layeredFurnitureCatalog"), "install graph walked")
  for (const reader of [
    "src/features/roomV2/roomV2Catalog",
    "src/features/roomV2/roomV2Selectors",
    "src/features/roomWorld/roomWorldRoomV2Projection",
    "src/features/miniRoom/scene/miniRoomSceneStore",
    "src/features/miniRoom/scene/AvatarLayer",
    "src/features/roomV2/editor/roomEditorPlaceMotion"
  ]) {
    assert.equal(reached.has(reader), false, `${reader} reads the seam at load and must not load before the install`)
  }
})
