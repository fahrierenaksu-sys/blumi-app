import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./DiscoveryBackground.tsx", import.meta.url), "utf8")

function loadDiscoveryBackground() {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText
  const absoluteFill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  runInNewContext(output, {
    exports,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
      if (name === "expo-image") return { Image: "ExpoImage" }
      if (name === "react-native") return { View: "View", StyleSheet: { absoluteFill, create: (styles) => styles } }
      if (name.endsWith(".png")) return name
      throw new Error(`Unexpected dependency: ${name}`)
    }
  })
  return exports
}

test("Discovery paints its fallback first and does not delay the bundled background", () => {
  const exports = loadDiscoveryBackground()

  const tree = exports.DiscoveryBackground()
  const image = tree.props.children
  assert.equal(tree.type, "View")
  assert.equal(tree.props.pointerEvents, "none")
  assert.equal(tree.props.style[0], image.props.style)
  assert.equal(tree.props.style[1].backgroundColor, "#FFF8FC")
  assert.equal(tree.props.style[1].overflow, "hidden")
  assert.equal(image.type, "ExpoImage")
  assert.equal(image.props.source, "../../../assets/ui/home-liquid-background-v2.png")
  assert.equal(image.props.contentFit, "cover")
  assert.equal(image.props.contentPosition, "center")
  assert.equal(image.props.cachePolicy, "memory-disk")
  assert.equal(image.props.priority, "normal")
  assert.equal(image.props.transition, 0)
  assert.equal(image.props.style, tree.props.style[0])
})

test("Discovery's same full-bleed background asset is opaque over the unchanged fallback", () => {
  const asset = readFileSync(new URL("../../../assets/ui/home-liquid-background-v2.png", import.meta.url))
  assert.equal(asset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")

  let offset = 8
  const chunks = []
  while (offset + 12 <= asset.length) {
    const length = asset.readUInt32BE(offset)
    const type = asset.toString("ascii", offset + 4, offset + 8)
    const data = asset.subarray(offset + 8, offset + 8 + length)
    chunks.push({ type, data })
    offset += length + 12
    if (type === "IEND") break
  }

  const header = chunks.find((chunk) => chunk.type === "IHDR")?.data
  assert.ok(header)
  assert.deepEqual([header.readUInt32BE(0), header.readUInt32BE(4)], [941, 1672])
  assert.equal(header[9], 2, "expected RGB PNG without an alpha channel")
  assert.equal(chunks.some((chunk) => chunk.type === "tRNS"), false, "expected no transparent-color chunk")
})

test("the decorative background yields admission priority to Discovery's visible hero imagery", () => {
  const source = readFileSync(new URL("./DiscoveryBackground.tsx", import.meta.url), "utf8")
  assert.match(source, /priority="normal"/)

  const deckSource = readFileSync(new URL("./DiscoveryDeckView.tsx", import.meta.url), "utf8")
  assert.match(deckSource, /imagePriority=\{isTop \? "high" : "low"\}/)

  const rendererSource = readFileSync(new URL("../avatarV2/room/components/RoomAvatarRenderer2D.tsx", import.meta.url), "utf8")
  assert.match(rendererSource, /imagePriority = "high"/)
  assert.match(rendererSource, /layers\.map\(\(layer\) =>/)
})
