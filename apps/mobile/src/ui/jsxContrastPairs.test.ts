import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"
import { findJsxContrastPairs } from "../testing/jsxContrastPairs"
import { blumiEntryTheme, uiTheme } from "./theme"

const SRC_ROOT = join(__dirname, "..")

/**
 * JSX pairs that may stay below the minimum, each with its reason. Keys are
 * `file#tag#foreground@background`. Do not add an entry to make the guard
 * pass; fix the colour unless one of these reasons really applies.
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
  "features/chat/ChatRoomInviteScene.tsx#Ionicons#FFECD5@DAA2AE":
    "decorative heart painted on the door of the room-invitation illustration; it carries no information and the card is announced by its accessible label"
}

const scan = (body: string, file = "x.tsx") => findJsxContrastPairs(file, body, uiTheme.colors, blumiEntryTheme.colors)

function listSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSources(path)
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : []
  })
}

test("a white Text on a pink View is found and fails", () => {
  const { pairs } = scan(`const A = () => <View style={{ backgroundColor: uiTheme.colors.primary }}><Text style={{ color: "#FFFFFF" }}>Go</Text></View>`)
  assert.equal(pairs.length, 1)
  assert.ok(pairs[0].ratio < pairs[0].minimum)
})

test("an icon colour prop is checked against the nearest container surface, through plain containers only", () => {
  const { pairs } = scan(`const A = () => (
    <Pressable style={{ backgroundColor: "#FFE2EE" }}>
      <View><Ionicons name="heart" color={uiTheme.colors.primary} /></View>
    </Pressable>)`)
  assert.deepEqual(pairs.map((pair) => [pair.foreground, pair.background, pair.minimum]), [["#F65C9D", "#FFE2EE", 3]])
  const behindComponent = scan(`const A = () => <Pressable style={{ backgroundColor: "#FFE2EE" }}><Card><Ionicons color="#F65C9D" /></Card></Pressable>`)
  assert.deepEqual(behindComponent.pairs, [])
  assert.equal(behindComponent.skippedBackground, 1)
})

test("a StyleSheet entry and a conditional colour are resolved, and each branch meets its own surface", () => {
  const { pairs } = scan(`
    const styles = StyleSheet.create({ chip: { backgroundColor: "#FFFFFF" }, chipActive: { backgroundColor: uiTheme.colors.primary } })
    const A = ({ active }) => (
      <View style={[styles.chip, active ? styles.chipActive : null]}>
        <Ionicons color={active ? uiTheme.colors.onPrimary : uiTheme.colors.textSecondary} />
      </View>)`)
  assert.deepEqual(pairs.map((pair) => `${pair.foreground}@${pair.background}`).sort(), ["#2B202A@#F65C9D", "#675B73@#FFFFFF"])
})

test("the entry theme's own tokens are used in files that import it as uiTheme", () => {
  const body = `import { blumiEntryTheme as uiTheme } from "../ui/theme"
    const A = () => <View style={{ backgroundColor: uiTheme.colors.primary }}><Text style={{ color: uiTheme.colors.onPrimary }}>Go</Text></View>`
  const [pair] = scan(body).pairs
  assert.equal(pair.foreground, blumiEntryTheme.colors.onPrimary.toUpperCase())
  assert.equal(pair.background, blumiEntryTheme.colors.primary.toUpperCase())
})

test("colours that are props, functions or transparent are skipped and counted, never guessed", () => {
  const scanned = scan(`const A = (p) => (
    <View style={{ backgroundColor: p.fill }}>
      <Text style={{ color: "#FFFFFF" }}>a</Text>
      <Text style={{ color: p.ink }}>b</Text>
      <Ionicons color={tint} />
    </View>)`)
  assert.deepEqual(scanned.pairs, [])
  assert.equal(scanned.skippedBackground, 1)
  assert.equal(scanned.skippedForeground, 2)
})

test("every literal or token colour drawn in JSX on a known surface is readable", () => {
  const paths = listSources(SRC_ROOT)
  let checkedElements = 0
  let skippedForeground = 0
  let skippedBackground = 0
  const failures = paths.flatMap((path) => {
    const file = relative(SRC_ROOT, path)
    const result = scan(readFileSync(path, "utf8"), file)
    checkedElements += result.checkedElements
    skippedForeground += result.skippedForeground
    skippedBackground += result.skippedBackground
    return result.pairs
      .filter((pair) => pair.ratio < pair.minimum && !EXEMPTIONS[`${file}#${pair.tag}#${pair.foreground.slice(1)}@${pair.background.slice(1)}`])
      .map((pair) => `${file}:${pair.line} ${pair.tag} ${pair.foreground} on ${pair.background} = ${pair.ratio.toFixed(2)}:1 (needs ${pair.minimum})`)
  })
  console.log(`jsx contrast: ${paths.length} files scanned, ${checkedElements} elements checked, skipped ${skippedForeground} with an unknown text colour and ${skippedBackground} with an unknown surface`)
  assert.ok(paths.length > 0, "the guard found no source files, so it checked nothing")
  assert.ok(checkedElements > 0, "the guard checked no JSX element, so its discovery is broken")
  assert.deepEqual(failures, [])
})
