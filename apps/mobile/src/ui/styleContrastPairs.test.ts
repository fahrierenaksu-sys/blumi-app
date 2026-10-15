import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"
import { findStyleContrastPairs } from "../testing/styleContrastPairs"
import { blumiEntryTheme, uiTheme } from "./theme"

const SRC_ROOT = join(__dirname, "..")

/**
 * Pairs that may stay below the minimum, each with its reason. Keys are
 * `file#textStyle@surfaceStyle`. Do not add an entry to make the guard pass;
 * fix the colour unless one of these reasons really applies.
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
  "features/demo/SwipeableDiscoverCard.tsx#likeStampText@page surface":
    "32 pt swipe stamp drawn over the card picture only while a card is dragged; the picture, not white, is behind it, and the like action is announced by its accessible button",
  "features/session/ProfileInterestsField.tsx#chipText@chipPressed":
    "momentary press highlight (4.49:1) on a chip whose resting state passes; the label is readable before and after the touch"
}

function listStyleSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listStyleSources(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const sample = (body: string) => `import { StyleSheet } from "react-native"\nconst s = StyleSheet.create({ ${body} })`

test("a white label on a pink action surface is found and fails", () => {
  const pairs = findStyleContrastPairs("x.ts", sample(`
    done: { backgroundColor: uiTheme.colors.primary },
    doneText: { color: "#FFFFFF" }`), uiTheme.colors)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].surfaceStyle, "done")
  assert.ok(pairs[0].ratio < pairs[0].minimum)
})

test("an active label is paired with the active surface, and the pressed surface too", () => {
  const pairs = findStyleContrastPairs("x.ts", sample(`
    chip: {}, chipActive: { backgroundColor: uiTheme.colors.primary },
    chipTextActive: { color: uiTheme.colors.onPrimary },
    send: { backgroundColor: "#FFFFFF" }, sendPressed: { backgroundColor: uiTheme.colors.primaryPressed },
    sendText: { color: "#fff" }`), uiTheme.colors)
  assert.deepEqual(pairs.map((pair) => `${pair.textStyle}@${pair.surfaceStyle}`).sort(),
    ["chipTextActive@chipActive", "sendText@send", "sendText@sendPressed"])
})

test("a plum label on a pink button is paired by the button's name and passes", () => {
  const [pair] = findStyleContrastPairs("x.ts", sample(`
    doneButton: { backgroundColor: uiTheme.colors.primary },
    doneText: { color: uiTheme.colors.onPrimary }`), uiTheme.colors)
  assert.equal(pair.surfaceStyle, "doneButton")
  assert.ok(pair.ratio >= pair.minimum)
})

test("a label meant for dark or pink fills is not judged against the page", () => {
  assert.deepEqual(findStyleContrastPairs("x.ts", sample(`label: { color: uiTheme.colors.textInverted }`), uiTheme.colors), [])
})

test("a pink token used as text with no background is checked on the page surface", () => {
  const [pair] = findStyleContrastPairs("x.ts", sample(`caption: { color: uiTheme.colors.primary }`), uiTheme.colors)
  assert.equal(pair.surfaceStyle, "page surface")
  assert.ok(pair.ratio < pair.minimum)
})

test("colours computed at run time are left out rather than guessed", () => {
  const pairs = findStyleContrastPairs("x.ts", sample(`
    a: { backgroundColor: props.fill }, aText: { color: "#FFFFFF" },
    b: { color: theme.colors.text }`), uiTheme.colors)
  assert.deepEqual(pairs, [])
})

test("a file that imports the entry theme as uiTheme is judged with the entry palette", () => {
  const body = `import { blumiEntryTheme as uiTheme } from "../ui/theme"\n${sample(`
    done: { backgroundColor: uiTheme.colors.primary },
    doneText: { color: uiTheme.colors.onPrimary }`)}`
  const [pair] = findStyleContrastPairs("x.ts", body, uiTheme.colors, blumiEntryTheme.colors)
  assert.equal(pair.foreground, blumiEntryTheme.colors.onPrimary.toUpperCase())
  assert.equal(pair.background, blumiEntryTheme.colors.primary.toUpperCase())
})

test("every text colour drawn on a style surface in the app is readable", () => {
  const failures = listStyleSources(SRC_ROOT).flatMap((path) => {
    const file = relative(SRC_ROOT, path)
    return findStyleContrastPairs(file, readFileSync(path, "utf8"), uiTheme.colors, blumiEntryTheme.colors)
      .filter((pair) => pair.ratio < pair.minimum && !EXEMPTIONS[`${file}#${pair.textStyle}@${pair.surfaceStyle}`])
      .map((pair) => `${file}: ${pair.textStyle} ${pair.foreground} on ${pair.surfaceStyle} ${pair.background} = ${pair.ratio.toFixed(2)}:1 (needs ${pair.minimum})`)
  })
  assert.deepEqual(failures, [])
})
