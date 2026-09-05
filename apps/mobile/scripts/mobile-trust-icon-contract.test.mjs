import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sourceRoot = new URL("../src/", import.meta.url)

async function readSource(relativePath) {
  return readFile(new URL(relativePath, sourceRoot), "utf8")
}

test("trust and recovery surfaces use the real icon system instead of placeholder glyphs", async () => {
  const files = [
    "screens/LegalScreen.tsx",
    "ui/errorBoundary.tsx",
    "ui/toast.tsx",
    "ui/fieldInput.tsx"
  ]
  const prohibitedGlyphs = /[💖🎭🛡🚫⚖🤝📢💫✓◆●]/u

  for (const file of files) {
    const source = await readSource(file)
    assert.doesNotMatch(source, prohibitedGlyphs, `${file} must not ship placeholder glyph icons`)
    assert.match(source, /@expo\/vector-icons\/Ionicons/, `${file} must use the shared Ionicons system`)
  }
})

test("field input icon names are constrained to the Ionicons catalog", async () => {
  const source = await readSource("ui/fieldInput.tsx")

  assert.match(source, /ComponentProps<typeof Ionicons>\["name"\]/)
  assert.match(source, /name="alert-circle"/)
})
