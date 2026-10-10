import assert from "node:assert/strict"
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
  const female = AVATAR_STILL_MANIFEST.bodies.female
  const { top: _starterTop, ...starterWithoutTop } = female.starter
  return {
    ...AVATAR_STILL_MANIFEST,
    bodies: {
      ...AVATAR_STILL_MANIFEST.bodies,
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
  const real = await createAvatarPortraitRenderer({ art }).render({ loadout: { ...female, topId: OTHER_TOP }, background })
  assert.ok(real.body.equals(starter.body))
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
