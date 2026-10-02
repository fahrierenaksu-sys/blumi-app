import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, cloneAvatarLoadout } from "@blumi/domain"
import type { AvatarLoadout } from "@blumi/contracts"
import {
  createNotificationPortraitLinks,
  NOTIFICATION_PORTRAIT_LINK_TTL_MS,
  NOTIFICATION_PORTRAIT_PATH_PREFIX,
  resolvePublicApiOrigin
} from "./notificationPortraitLinks"

const secret = "s".repeat(40)
const origin = "https://api.example.test"
const loadout = cloneAvatarLoadout(DEFAULT_FEMALE_AVATAR_LOADOUT as AvatarLoadout)
const content = { loadout, background: "#FFD9E8" }
const now = new Date("2026-10-02T12:00:00.000Z")

const tokenOf = (url: string) => {
  const parsed = new URL(url)
  assert.equal(parsed.origin, origin)
  assert.ok(parsed.pathname.startsWith(NOTIFICATION_PORTRAIT_PATH_PREFIX))
  assert.equal(parsed.search, "")
  return parsed.pathname.slice(NOTIFICATION_PORTRAIT_PATH_PREFIX.length)
}

test("a picture link opens to what it shows until it expires, and names nothing in clear", () => {
  const links = createNotificationPortraitLinks({ secret, publicOrigin: origin })
  const url = links.createUrl(content, now)!
  const token = tokenOf(url)
  assert.deepEqual(links.open(token, new Date(now.getTime() + 60_000)), content)
  assert.deepEqual(links.open(token, new Date(now.getTime() + NOTIFICATION_PORTRAIT_LINK_TTL_MS - 1_000)), content)
  assert.equal(links.open(token, new Date(now.getTime() + NOTIFICATION_PORTRAIT_LINK_TTL_MS + 1_000)), null, "expired")
  assert.ok(url.length < 1024, `link is ${url.length} characters`)
  for (const itemId of [loadout.hairId, loadout.topId, loadout.bodyId]) {
    assert.ok(!url.includes(itemId), "item ids are sealed, not readable")
  }
  assert.notEqual(links.createUrl(content, now), url, "every link is fresh (random IV)")
})

test("a forged, altered or foreign link opens to nothing", () => {
  const links = createNotificationPortraitLinks({ secret, publicOrigin: origin })
  const token = tokenOf(links.createUrl(content, now)!)
  const flipped = `${token.slice(0, 20)}${token[20] === "A" ? "B" : "A"}${token.slice(21)}`
  assert.equal(links.open(flipped, now), null)
  assert.equal(links.open(token.slice(0, -2), now), null)
  assert.equal(links.open("", now), null)
  assert.equal(links.open("not a token!", now), null)
  assert.equal(links.open("A".repeat(5000), now), null)
  const other = createNotificationPortraitLinks({ secret: "t".repeat(40), publicOrigin: origin })
  assert.equal(other.open(token, now), null, "another secret cannot open it")
  assert.equal(other.open(tokenOf(other.createUrl({ ...content, background: "red" }, now)!), now), null, "invalid content is refused")
})

test("links need a long secret and a public https origin", () => {
  assert.throws(() => createNotificationPortraitLinks({ secret: "short" }))
  assert.equal(createNotificationPortraitLinks({ secret }).createUrl(content, now), undefined, "no origin, no picture")
  assert.throws(() => createNotificationPortraitLinks({ secret, publicOrigin: "http://api.example.test" }))
  assert.equal(resolvePublicApiOrigin({ RAILWAY_PUBLIC_DOMAIN: "blumi.up.railway.app" }), "https://blumi.up.railway.app")
  assert.equal(resolvePublicApiOrigin({ BLUMI_PUBLIC_API_ORIGIN: "https://api.blumi.test/", RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app" }), "https://api.blumi.test")
  assert.equal(resolvePublicApiOrigin({}), undefined)
})
