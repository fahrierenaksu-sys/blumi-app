import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

test("the shared Shop/Discovery background uses an immediate fallback and cached image layer", () => {
  const source = readFileSync(new URL("./HomeLiquidBackground.tsx", import.meta.url), "utf8")
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
      if (name === "react-native") {
        return { View: "View", StyleSheet: { absoluteFill, create: (styles) => styles } }
      }
      if (name.endsWith(".png")) return name
      throw new Error(`Unexpected dependency: ${name}`)
    }
  })

  const background = exports.HomeLiquidBackground()
  const discoveryBackground = exports.HomeLiquidBackground({ priority: "normal" })
  const image = background.props.children
  const discoveryImage = discoveryBackground.props.children
  assert.equal(background.props.pointerEvents, "none")
  assert.equal(background.props.style[0], absoluteFill)
  assert.equal(background.props.style[1].backgroundColor, "#FFF8FC")
  assert.equal(image.type, "ExpoImage")
  assert.equal(image.props.source, "../../assets/ui/home-liquid-background-v2.png")
  assert.equal(image.props.contentFit, "cover")
  assert.equal(image.props.contentPosition, "center")
  assert.equal(image.props.cachePolicy, "memory-disk")
  assert.equal(image.props.priority, "high")
  assert.equal(image.props.transition, 0)
  assert.equal(image.props.style, absoluteFill)
  assert.equal(discoveryImage.props.priority, "normal")
  assert.equal(discoveryImage.props.cachePolicy, "memory-disk")
  assert.equal(discoveryImage.props.transition, 0)

  const asset = readFileSync(new URL(image.props.source, new URL("./HomeLiquidBackground.tsx", import.meta.url)))
  assert.equal(asset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  assert.deepEqual([asset.readUInt32BE(16), asset.readUInt32BE(20)], [941, 1672])
})
