import assert from "node:assert/strict"
import test from "node:test"
import { getGlassSurfaceColors, type GlassTone } from "./glassSurfaceModel"

const tones: GlassTone[] = ["light", "dark", "accent"]

function alpha(color: string): number {
  const rgba = /rgba\([^)]*,\s*([0-9.]+)\)/.exec(color)
  return rgba ? Number(rgba[1]) : 1
}

test("Reduce Transparency turns every glass tone fully opaque", () => {
  for (const tone of tones) {
    const opaque = getGlassSurfaceColors(tone, true)
    assert.equal(alpha(opaque.backgroundColor), 1, tone)
    assert.equal(alpha(opaque.borderColor), 1, tone)
    assert.match(opaque.backgroundColor, /^#[0-9A-F]{6}$/i)
  }
})

test("without the setting the surfaces stay translucent glass", () => {
  for (const tone of tones) {
    assert.ok(alpha(getGlassSurfaceColors(tone, false).backgroundColor) < 1, tone)
  }
})
