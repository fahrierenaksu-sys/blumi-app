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

// Ratchet: existing ui -> features imports are recorded here. New ones fail the
// test; removing one also fails until it is deleted from this list, so the
// list can only shrink.
const UI_TO_FEATURES_BASELINE = [
  "src/ui/BlumiLoadingScreen.tsx -> src/features/session/OnboardingGreetingPair",
  "src/ui/BlumiLoadingScreen.tsx -> src/features/session/OnboardingScanStage",
  "src/ui/BlumiLoadingScreen.tsx -> src/features/session/nativeOnboardingBootBridge",
  "src/ui/BlumiLoadingScreen.tsx -> src/features/session/onboardingBrandPreludeModel",
  "src/ui/bottomNav.tsx -> src/features/session/accountRecoveryCopy",
  "src/ui/bottomNav.tsx -> src/features/session/appNavigationCopy",
  "src/ui/bottomNav.tsx -> src/features/session/authLocale",
  "src/ui/connectionBanner.tsx -> src/features/network/networkStore",
  "src/ui/errorBoundary.tsx -> src/features/session/appLocale",
  "src/ui/errorBoundaryCopy.ts -> src/features/session/appLocale",
  "src/ui/layout/bottomNavMotionModel.ts -> src/features/session/accountRecoveryCopy",
  "src/ui/myAvatar.tsx -> src/features/avatarV2/room/avatarRoomCatalog",
  "src/ui/myAvatar.tsx -> src/features/avatarV2/room/avatarRoomProjection",
  "src/ui/myAvatar.tsx -> src/features/avatarV2/room/avatarRoomSelectors",
  "src/ui/myAvatar.tsx -> src/features/avatarV2/room/components/RoomAvatarRenderer2D",
  "src/ui/myAvatar.tsx -> src/features/avatarV2/state/AvatarV2Provider",
  "src/ui/participantAvatar.tsx -> src/features/avatarV2/avatarSelectionModel",
  "src/ui/participantAvatar.tsx -> src/features/avatarV2/room/avatarRoomCatalog",
  "src/ui/participantAvatar.tsx -> src/features/avatarV2/room/avatarRoomProjection",
  "src/ui/participantAvatar.tsx -> src/features/avatarV2/room/avatarRoomSelectors",
  "src/ui/participantAvatar.tsx -> src/features/avatarV2/room/components/RoomAvatarRenderer2D",
  "src/ui/participantAvatar.tsx -> src/features/chat/chatParticipantAvatar"
]

test("src/ui -> src/features imports only shrink against the recorded baseline", () => {
  const actual = describe(importsInto(collectImports("ui"), "features"))
  const baseline = [...UI_TO_FEATURES_BASELINE].sort()

  const added = actual.filter((entry) => !baseline.includes(entry))
  const removed = baseline.filter((entry) => !actual.includes(entry))

  assert.deepEqual(
    added,
    [],
    "New src/ui -> src/features imports are not allowed. Move the shared code to a lower layer instead."
  )
  assert.deepEqual(
    removed,
    [],
    "These src/ui -> src/features imports are gone. Remove them from UI_TO_FEATURES_BASELINE."
  )
})
