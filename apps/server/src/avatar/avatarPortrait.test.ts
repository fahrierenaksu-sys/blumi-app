import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import sharp from "sharp"
import {
  AVATAR_STILL_MANIFEST,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  cloneAvatarLoadout,
  pickAvatarSwatch,
  type AvatarStillManifest
} from "@blumi/domain"
import type { AvatarLoadout } from "@blumi/contracts"
import {
  AVATAR_PORTRAIT_SIZE,
  checkAvatarPortraitRenderer,
  createAvatarPortraitRenderer,
  loadAvatarPortraitArt
} from "./avatarPortrait"

const art = loadAvatarPortraitArt()
const female = cloneAvatarLoadout(DEFAULT_FEMALE_AVATAR_LOADOUT as AvatarLoadout)
const male = cloneAvatarLoadout(DEFAULT_MALE_AVATAR_LOADOUT as AvatarLoadout)
/** Items no rig has art for (made-up and old catalog IDs): each slot draws as the body's starter piece. */
const unknownItems = (loadout: AvatarLoadout): AvatarLoadout => ({
  ...loadout,
  hairId: "avatar_v2_hair_never_existed",
  topId: "avatar_v2_top_never_existed",
  bottomId: "avatar_v2_bottom_never_existed",
  shoesId: "avatar_v2_shoes_never_existed"
})

/**
 * The baked manifest as if no body had front art yet: every test of the 3/4 bust or of a synthetic front base starts
 * from this, so landing real front art in the manifest (data only) cannot change what those tests prove.
 */
function withoutFrontArt(manifest: AvatarStillManifest = AVATAR_STILL_MANIFEST): AvatarStillManifest {
  const bodies = Object.fromEntries(
    Object.entries(manifest.bodies).map(([rig, body]) => {
      const { showcaseBase: _base, ...rest } = body
      const items = Object.fromEntries(Object.entries(body.items).map(([id, item]) => {
        const { showcase: _showcase, ...bare } = item
        return [id, bare]
      }))
      return [rig, { ...rest, items }]
    })
  )
  return { ...manifest, bodies } as unknown as AvatarStillManifest
}

async function pixels(body: Buffer) {
  const { data, info } = await sharp(body).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x: number, y: number) => {
    const offset = (y * info.width + x) * 3
    return `#${[...data.subarray(offset, offset + 3)].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
  }
  return { info, at }
}

test("the server build packs the 2.5D bust layers of both bodies; the server never reads app sources", () => {
  assert.ok(art, "dist/art holds the avatar bust layers (scripts/build-art-pack.mjs)")
  for (const rig of ["female", "male"]) {
    const layers = [...art.files].filter((path) => path.startsWith(`avatar/${rig}/bust/`))
    assert.ok(layers.length >= 4, `${rig} has bust layers`)
    for (const path of layers) assert.match(path, /^avatar\/(female|male)\/bust\/[\w-]+\.webp$/)
  }
})

test("girl and boy portraits are small square PNGs on the person's swatch, the same bytes for the same look", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art })
  const background = renderer.backgroundFor("seed_a")
  assert.equal(background, pickAvatarSwatch("seed_a").bg, "the colour of the app's avatar circle")

  const girl = await renderer.render({ loadout: female, background })
  const again = await createAvatarPortraitRenderer({ art }).render({ loadout: cloneAvatarLoadout(female), background })
  const boy = await renderer.render({ loadout: male, background })
  assert.ok(girl.body.equals(again.body), "deterministic for a loadout")
  assert.ok(!girl.body.equals(boy.body), "the boy is drawn from his own rig")

  for (const portrait of [girl, boy]) {
    assert.equal(portrait.mimeType, "image/png")
    const metadata = await sharp(portrait.body).metadata()
    assert.deepEqual([metadata.format, metadata.width, metadata.height], ["png", AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE])
    assert.ok(portrait.body.length < 64 * 1024, `portrait is ${portrait.body.length} bytes`)
    // The chibi's head covers the middle of the picture; the background fills the corner.
    const { at } = await pixels(portrait.body)
    assert.equal(at(1, 1), background.toUpperCase())
    assert.notEqual(at(AVATAR_PORTRAIT_SIZE / 2, AVATAR_PORTRAIT_SIZE / 2), background.toUpperCase())
  }
})

test("a sender wearing items without rig art still gets a picture: the body's starter pieces", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art })
  const background = "#FFD9E8"
  for (const loadout of [female, male]) {
    const drawn = await renderer.render({ loadout: unknownItems(loadout), background })
    const starter = await renderer.render({ loadout, background })
    assert.ok(drawn.body.equals(starter.body))
  }
})

test("a layer missing from the art pack never yields a half-drawn chibi, and never a missing picture", async () => {
  assert.ok(art)
  const holed = { dir: art.dir, files: new Set([...art.files].filter((path) => path.includes("avatar/female/") && path.includes("avatar_v2_top_coral_wave_polo") ? false : true)) }
  const background = "#D6EEFF"
  // The girl's starter wears that polo too, so neither her look nor her starter can be drawn: the last level is a
  // fixed per-body bust, a valid link still gets a picture of the right size on the person's colour.
  const portrait = await createAvatarPortraitRenderer({ art: holed }).render({ loadout: female, background })
  const whole = await createAvatarPortraitRenderer({ art }).render({ loadout: female, background })
  const { info, at } = await pixels(portrait.body)
  assert.deepEqual([info.width, info.height], [AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE])
  assert.equal(at(1, 1), background.toUpperCase())
  assert.notEqual(at(AVATAR_PORTRAIT_SIZE / 2, AVATAR_PORTRAIT_SIZE - 20), background.toUpperCase(), "the fixed bust is drawn")
  assert.ok(!portrait.body.equals(whole.body), "the fixed bust is not the chibi")
  // The other body is unaffected by a hole in the girl's files and still gets its own, different bust.
  const boy = await createAvatarPortraitRenderer({ art: holed }).render({ loadout: male, background })
  const boyAlone = await createAvatarPortraitRenderer({ art }).render({ loadout: male, background })
  assert.ok(boy.body.equals(boyAlone.body))
})

test("without any art pack every body still gets its own fixed bust, never an error", async () => {
  const renderer = createAvatarPortraitRenderer({ art: null })
  const background = "#FFD9E8"
  const girl = await renderer.render({ loadout: female, background })
  const boy = await renderer.render({ loadout: male, background })
  assert.ok(!girl.body.equals(boy.body), "one fixed bust per body")
  for (const portrait of [girl, boy]) {
    const { info, at } = await pixels(portrait.body)
    assert.deepEqual([info.width, info.height], [AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE])
    assert.equal(at(1, 1), background.toUpperCase())
  }
})

test("the start-up self-check draws both default portraits and names only an error class on failure", async () => {
  assert.ok(art)
  assert.deepEqual(await checkAvatarPortraitRenderer(createAvatarPortraitRenderer({ art })), { ok: true })
  const empty = mkdtempSync(join(tmpdir(), "blumi-art-"))
  try {
    cpSync(join(art.dir, "manifest.json"), join(empty, "manifest.json"))
    const broken = loadAvatarPortraitArt(empty)
    assert.ok(broken, "the manifest names the files, but none are on disk")
    const result = await checkAvatarPortraitRenderer(createAvatarPortraitRenderer({ art: broken }))
    assert.equal(result.ok, false)
    assert.ok(!result.ok && /^[A-Za-z]+$/.test(result.errorType))
    assert.deepEqual(await checkAvatarPortraitRenderer(null), { ok: false, errorType: "MissingArtPack" })
    const missing = await checkAvatarPortraitRenderer(createAvatarPortraitRenderer({ art: null }))
    assert.equal(missing.ok, false, "pictures still go out, but the self-check says the art pack is not used")
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test("the portrait cache stays within its byte budget and a bad background is refused", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art, maxCacheBytes: 1 })
  const background = "#FFD9E8"
  const first = await renderer.render({ loadout: female, background })
  const second = await renderer.render({ loadout: female, background })
  assert.ok(first.body.equals(second.body), "redrawn when it does not fit the cache")
  await assert.rejects(renderer.render({ loadout: female, background: "red" }))
})

test("a truncated art manifest never stops the server: no art, so the fixed busts", async () => {
  const broken = mkdtempSync(join(tmpdir(), "blumi-art-"))
  try {
    writeFileSync(join(broken, "manifest.json"), '{"files": {"avatar/female/bust/bo')
    assert.equal(loadAvatarPortraitArt(broken), null)
    const renderer = createAvatarPortraitRenderer({ art: loadAvatarPortraitArt(broken) })
    assert.equal((await renderer.render({ loadout: female, background: "#D6EEFF" })).level, "fixed")
    assert.deepEqual(await checkAvatarPortraitRenderer(renderer), { ok: false, errorType: "FallbackPortrait" })
  } finally {
    rmSync(broken, { recursive: true, force: true })
  }
})

/**
 * The baked manifest holds only each body's starter outfit today (the rigs have no other items; every catalog item
 * outside it, even the default girl's own, draws as a starter piece), so the "saved outfit changes the picture"
 * proof bakes a real second girl top (a stock catalog item) into a copy of it. That top owns no layers: it draws
 * the bare body, so the picture must differ from the polo and show no polo or sleeve pixel at all.
 */
const OTHER_TOP = "avatar_v2_top_sage_ribbon_knit_jacket"
const girlManifest = (options: { otherTop: boolean; starterTop: boolean }): AvatarStillManifest => {
  const bare = withoutFrontArt()
  const female = bare.bodies.female
  const { top: _starterTop, ...starterWithoutTop } = female.starter
  return {
    ...bare,
    bodies: {
      ...bare.bodies,
      female: {
        ...female,
        starter: options.starterTop ? female.starter : starterWithoutTop,
        items: options.otherTop
          ? { ...female.items, [OTHER_TOP]: { slot: "top", rigItemId: "top_sage_ribbon_knit_jacket", thumb: OTHER_TOP } }
          : female.items
      }
    }
  }
}

test("the saved outfit decides the picture: a bare top draws no top or sleeve pixel, the same outfit the same bytes", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art, manifest: girlManifest({ otherTop: true, starterTop: true }) })
  const background = "#FFD9E8"
  const starter = await renderer.render({ loadout: female, background })
  const bare = await renderer.render({ loadout: { ...female, topId: OTHER_TOP }, background })
  const bareAgain = await renderer.render({ loadout: { ...female, topId: OTHER_TOP }, background })
  assert.equal(bare.level, "look")
  assert.ok(!bare.body.equals(starter.body), "a different worn top is a different picture")
  assert.ok(bare.body.equals(bareAgain.body))
  // A girl with no top at all (no worn top, no starter top) is the same picture: only the body's own layers.
  const noTopAnywhere = createAvatarPortraitRenderer({ art, manifest: girlManifest({ otherTop: false, starterTop: false }) })
  const none = await noTopAnywhere.render({ loadout: female, background })
  assert.ok(bare.body.equals(none.body), "no polo layer, and so no sleeve fragment, is drawn without its top")
  // The real manifest bakes no such top: the same loadout there is the starter picture.
  const real = await createAvatarPortraitRenderer({ art, manifest: withoutFrontArt() }).render({ loadout: { ...female, topId: OTHER_TOP }, background })
  const realStarter = await createAvatarPortraitRenderer({ art, manifest: withoutFrontArt() }).render({ loadout: female, background })
  assert.ok(real.body.equals(realStarter.body))
})

test("a sender wearing retired catalog items and an old dress pair still gets the body's starter picture", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art })
  const background = "#FFD9E8"
  const retired = {
    ...female,
    hairId: "avatar_v2_hair_male_espresso_crop",
    topId: "avatar_v2_top_male_charcoal_leather_bomber_hybrid"
  } as AvatarLoadout
  const drawn = await renderer.render({ loadout: retired, background })
  const starter = await renderer.render({ loadout: female, background })
  assert.ok(drawn.body.equals(starter.body))
  assert.equal(drawn.level, "look")
})

/**
 * Front (showcase) art for the girl, synthetic: a 300x720 base that is green except a blue square exactly where the
 * `push` window is, and transparent item layers. The picture is then blue only if the push window was cut out.
 */
const FRONT_CANVAS = { width: 300, height: 720 }
const PUSH_WINDOW = [50, 0, 200, 200] as const

function girlWithFrontArt(options: { omit?: readonly string[] } = {}): AvatarStillManifest {
  const base = withoutFrontArt()
  const girl = base.bodies.female
  const items = Object.fromEntries(
    Object.entries(girl.items).map(([id, item], index) => [
      id,
      options.omit?.includes(item.slot) ? item : { ...item, showcase: { key: `${id}__front`, rect: [0, 0, FRONT_CANVAS.width, FRONT_CANVAS.height] as const, order: index + 1 } }
    ])
  )
  const showcaseBase = {
    key: "base__front",
    canvas: FRONT_CANVAS,
    ground: [150, 700] as const,
    windows: { card: [0, 0, 300, 720] as const, head: [50, 0, 200, 200] as const, push: PUSH_WINDOW }
  }
  return { ...base, bodies: { ...base.bodies, female: { ...girl, items, showcaseBase } } }
}

/** An art pack dir: the real bust layers plus the synthetic front layers of `manifest` (minus `missing` keys). */
async function packWithFrontArt(manifest: AvatarStillManifest, missing: readonly string[] = []) {
  assert.ok(art)
  const dir = mkdtempSync(join(tmpdir(), "blumi-art-"))
  cpSync(join(art.dir, "avatar"), join(dir, "avatar"), { recursive: true })
  mkdirSync(join(dir, "avatar/female/showcase"), { recursive: true })
  const girl = manifest.bodies.female
  const keys = [girl.showcaseBase!.key, ...Object.values(girl.items).flatMap((item) => (item.showcase ? [item.showcase.key] : []))]
  const green = { r: 0, g: 160, b: 0, alpha: 1 }
  const blue = { r: 0, g: 0, b: 255, alpha: 1 }
  const baseSquare = await sharp({ create: { width: PUSH_WINDOW[2], height: PUSH_WINDOW[3], channels: 4, background: blue } }).png().toBuffer()
  const base = await sharp({ create: { ...FRONT_CANVAS, channels: 4, background: green } })
    .composite([{ input: baseSquare, left: PUSH_WINDOW[0], top: PUSH_WINDOW[1] }])
    .webp({ lossless: true })
    .toBuffer()
  const clear = await sharp({ create: { ...FRONT_CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).webp({ lossless: true }).toBuffer()
  for (const key of keys) {
    if (missing.includes(key)) continue
    writeFileSync(join(dir, `avatar/female/showcase/${key}.webp`), key === girl.showcaseBase!.key ? base : clear)
  }
  const files = Object.fromEntries([...art.files, ...keys.filter((key) => !missing.includes(key)).map((key) => `avatar/female/showcase/${key}.webp`)].map((path) => [path, "x"]))
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 1, files }))
  return { dir, pack: loadAvatarPortraitArt(dir)! }
}

test("a look with front art is the push crop of the front figure, cut from the push window and nothing else", async () => {
  const manifest = girlWithFrontArt()
  const { dir, pack } = await packWithFrontArt(manifest)
  try {
    const background = "#FFD9E8"
    const front = await createAvatarPortraitRenderer({ art: pack, manifest }).render({ loadout: female, background })
    assert.deepEqual([front.level, front.view], ["look", "showcase"])
    const { info, at } = await pixels(front.body)
    assert.deepEqual([info.width, info.height], [AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE])
    for (const [x, y] of [[2, 2], [AVATAR_PORTRAIT_SIZE - 3, 2], [2, AVATAR_PORTRAIT_SIZE - 3], [AVATAR_PORTRAIT_SIZE / 2, AVATAR_PORTRAIT_SIZE / 2]] as const) {
      assert.equal(at(x, y), "#0000FF", `the window is the whole picture at ${x},${y}`)
    }
    const again = await createAvatarPortraitRenderer({ art: pack, manifest }).render({ loadout: cloneAvatarLoadout(female), background })
    assert.ok(front.body.equals(again.body), "deterministic for a loadout")
    // Items without art draw as the body's starter pieces, in the front view too.
    const unknown = await createAvatarPortraitRenderer({ art: pack, manifest }).render({ loadout: unknownItems(female), background })
    assert.ok(unknown.body.equals(front.body))
    assert.equal(unknown.view, "showcase")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a look the front art does not cover whole is drawn as the 3/4 bust, never a mix of the two", async () => {
  const background = "#D6EEFF"
  const bustOnly = await createAvatarPortraitRenderer({ art, manifest: withoutFrontArt() }).render({ loadout: female, background })
  // One worn item has no front layer yet.
  const partial = girlWithFrontArt({ omit: ["top"] })
  const partialPack = await packWithFrontArt(partial)
  // Every item has one, but a front file is missing from the art pack.
  const complete = girlWithFrontArt()
  const holedKey = Object.values(complete.bodies.female.items).find((item) => item.slot === "shoes")!.showcase!.key
  const holedPack = await packWithFrontArt(complete, [holedKey])
  try {
    const noLayer = await createAvatarPortraitRenderer({ art: partialPack.pack, manifest: partial }).render({ loadout: female, background })
    assert.deepEqual([noLayer.level, noLayer.view], ["look", "bust"])
    assert.ok(noLayer.body.equals(bustOnly.body), "exactly today's bust picture")
    const noFile = await createAvatarPortraitRenderer({ art: holedPack.pack, manifest: complete }).render({ loadout: female, background })
    assert.deepEqual([noFile.level, noFile.view], ["look", "bust"])
    assert.ok(noFile.body.equals(bustOnly.body))
  } finally {
    rmSync(partialPack.dir, { recursive: true, force: true })
    rmSync(holedPack.dir, { recursive: true, force: true })
  }
})

test("a look with no front art draws the 3/4 bust, and without an art pack the fixed bust", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art, manifest: withoutFrontArt() })
  for (const loadout of [female, male]) assert.equal((await renderer.render({ loadout, background: "#FFD9E8" })).view, "bust")
  assert.equal((await createAvatarPortraitRenderer({ art: null }).render({ loadout: female, background: "#FFD9E8" })).view, "fixed")
})

test("every body whose starter look has front art in the baked manifest draws its push picture from it", async () => {
  assert.ok(art)
  const renderer = createAvatarPortraitRenderer({ art })
  for (const [rig, loadout] of [["female", female], ["male", male]] as const) {
    const body = AVATAR_STILL_MANIFEST.bodies[rig]
    const hasFront = Boolean(body.showcaseBase) && Object.values(body.starter).every((id) => id && body.items[id]?.showcase)
    const result = await renderer.render({ loadout, background: "#FFD9E8" })
    assert.equal(result.view, hasFront ? "showcase" : "bust", `${rig}: the push picture follows the manifest's front art`)
  }
})

test("a front base without usable crop windows falls back to the 3/4 bust instead of dropping the picture", async () => {
  assert.ok(art)
  const background = "#FFD9E8"
  const bustOnly = await createAvatarPortraitRenderer({ art, manifest: withoutFrontArt() }).render({ loadout: female, background })
  const good = girlWithFrontArt()
  const girl = good.bodies.female
  const broken = (showcaseBase: unknown): AvatarStillManifest =>
    ({ ...good, bodies: { ...good.bodies, female: { ...girl, showcaseBase } } }) as unknown as AvatarStillManifest
  const noWindows = { ...girl.showcaseBase!, windows: undefined }
  const outside = { ...girl.showcaseBase!, windows: { ...girl.showcaseBase!.windows, push: [0, 0, 9999, 9999] } }
  const notNumbers = { ...girl.showcaseBase!, windows: { ...girl.showcaseBase!.windows, push: ["a", 0, 10, 10] } }
  const noCanvas = { ...girl.showcaseBase!, canvas: undefined }
  for (const manifest of [broken(noWindows), broken(outside), broken(notNumbers), broken(noCanvas)]) {
    const result = await createAvatarPortraitRenderer({ art, manifest }).render({ loadout: female, background })
    assert.deepEqual([result.level, result.view], ["look", "bust"])
    assert.ok(result.body.equals(bustOnly.body))
  }
})

test("the start-up check fails when the manifest has front art for a default look but the pack draws the bust", async () => {
  assert.ok(art)
  const withFront = girlWithFrontArt()
  // Front art in the manifest, but none of it in the pack: every default push would silently be the bust.
  const staleResult = await checkAvatarPortraitRenderer(createAvatarPortraitRenderer({ art, manifest: withFront }), { manifest: withFront })
  assert.deepEqual(staleResult, { ok: false, errorType: "MissingFrontArt" })
  const noFront = withoutFrontArt()
  assert.deepEqual(await checkAvatarPortraitRenderer(createAvatarPortraitRenderer({ art, manifest: noFront }), { manifest: noFront }), { ok: true })
})
