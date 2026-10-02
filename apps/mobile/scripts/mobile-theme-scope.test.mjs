import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function readSource(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("generic mobile theme preserves the approved Discovery palette", () => {
  const source = readSource("src/ui/theme.ts")
  const genericThemeSource = source.split("export const blumiEntryTheme =")[0]

  for (const token of [
    'background: "#FBF8FD"',
    'backgroundWarm: "#FEF4F9"',
    'surfaceSoft: "#FFF2F8"',
    'surfaceMuted: "#F9F3FC"',
    'surfaceRaised: "#FFFDFE"',
    'overlayDark: "rgba(28, 16, 34, 0.56)"',
    'overlaySoft: "rgba(28, 16, 34, 0.16)"',
    'textPrimary: "#20162A"',
    'textSecondary: "#675B73"',
    'textMuted: "#9589A4"',
    'border: "#F0E7F6"',
    'borderStrong: "#E7DAF0"',
    'primary: "#F65C9D"',
    'primaryDeep: "#D92A79"',
    'primaryPressed: "#E24486"',
    'primaryDisabled: "#F7A8CB"',
    'primarySoft: "#FFE2EE"',
    'secondary: "#F3EDF7"',
    'secondaryPressed: "#E9E1F0"',
    'secondaryText: "#493F56"',
    'chipBackground: "#FFE9F4"',
    'chipText: "#B93872"',
    'avatarBackground: "#F5ECFA"',
    'avatarAccent: "#EADBF5"',
    'divider: "#F3ECF8"',
    'blobPink: "#FFC8DF"',
    'blobPeach: "#FFE0CC"',
    'blobLilac: "#E7D5F4"',
    'accentGlow: "rgba(255, 79, 152, 0.18)"',
    'accentGlowStrong: "rgba(255, 79, 152, 0.32)"',
    'avatarPreviewGlow: "rgba(255, 79, 152, 0.14)"',
    'primary: ["#F65C9D", "#FF7EB3"]',
    'primaryDeep: ["#D92A79", "#F65C9D"]',
    'warm: ["#F65C9D", "#FFB99A"]',
    'cool: ["#9B59B6", "#667EEA"]',
    'match: ["#F65C9D", "#FF7EB3", "#FFB99A"]',
    'sunset: ["#FF6B6B", "#F65C9D", "#9B59B6"]',
    'heroBackground: ["#FBF8FD", "#FEF4F9", "#FFF2F8"]',
    'shadowColor: "#D92A79"',
    'shadowColor: "#F65C9D"'
  ]) {
    assert.match(
      genericThemeSource,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    )
  }

  assert.doesNotMatch(genericThemeSource, /primary: "#C63D59"/)
  assert.doesNotMatch(genericThemeSource, /primaryDeep: "#A92F48"/)
})

test("entry and onboarding surfaces have their scoped Blumi palette", () => {
  const themeSource = readSource("src/ui/theme.ts")
  const entryThemeSource = themeSource.split("export const blumiEntryTheme =")[1] ?? ""
  assert.ok(entryThemeSource, "blumiEntryTheme is exported")
  assert.match(entryThemeSource, /primary: "#C63D59"/)
  assert.match(entryThemeSource, /primaryDeep: "#A92F48"/)
})
