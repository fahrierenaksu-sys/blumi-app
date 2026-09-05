import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sourceRoot = new URL("../src/", import.meta.url)

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8")
}

test("core navigation and status surfaces use Ionicons instead of text glyph icons", async () => {
  const files = [
    "screens/ProfileEditScreen.tsx",
    "screens/InboxScreen.tsx",
    "screens/LobbyScreen.tsx",
    "features/miniRoom/scene/MiniRoomHud.tsx"
  ]
  const prohibitedGlyphs = /[←→‹›❤♥♡●✓✦]/u

  for (const file of files) {
    const source = await readSource(file)
    assert.doesNotMatch(
      source,
      prohibitedGlyphs,
      `${file} must not render navigation or status icons as text glyphs`
    )
    assert.match(
      source,
      /@expo\/vector-icons\/Ionicons/,
      `${file} must use the shared Ionicons system`
    )
  }

  const profileSource = await readSource("screens/ProfileEditScreen.tsx")
  assert.match(profileSource, /name=\{selected\s*\?\s*"checkmark"\s*:\s*"add"\}/)
})

test("critical selection and modal controls do not fall back to font glyph icons", async () => {
  const files = [
    "components/MatchResultModal.tsx",
    "components/DiscoverFiltersBottomSheet.tsx",
    "ui/vibeTilePicker.tsx",
    "screens/ProfileSetupScreen.tsx"
  ]

  for (const file of files) {
    const source = await readSource(file)
    assert.doesNotMatch(source, /[✕✓♀♂]/u, `${file} must use vector icons`)
    assert.match(source, /@expo\/vector-icons\/Ionicons/)
  }
})

test("legacy identity fallback uses honest initials instead of a generated glyph face", async () => {
  const source = await readSource("ui/avatar.tsx")

  assert.match(source, /const initials = deriveInitials\(name\)/)
  assert.match(source, /\{initials\}/)
  assert.doesNotMatch(source, /const EYES|const MOUTHS|ACCESSORY_GLYPH|deriveFaceParts/)
  assert.doesNotMatch(source, /hatGlyph/)
})
