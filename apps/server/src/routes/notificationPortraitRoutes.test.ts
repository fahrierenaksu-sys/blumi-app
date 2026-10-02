import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_MALE_AVATAR_LOADOUT, cloneAvatarLoadout } from "@blumi/domain"
import type { AvatarLoadout } from "@blumi/contracts"
import { createServer } from "../server"
import { createNotificationPortraitService } from "../notifications/notificationPortraitService"

test("a phone without a session downloads the sender picture its push links to, and nothing else", async () => {
  const portraits = createNotificationPortraitService({ secret: "k".repeat(40), publicOrigin: "https://api.example.test" })
  const app = createServer({ notificationPortraits: portraits })
  try {
    const url = portraits.urlFor({ userId: "user_ada", loadout: cloneAvatarLoadout(DEFAULT_MALE_AVATAR_LOADOUT as AvatarLoadout) }, new Date())
    assert.ok(url, "pictures are on when the server has an origin and the bundled layers")
    assert.ok(!url.includes("user_ada"))
    const path = new URL(url).pathname

    const picture = await app.inject({ method: "GET", url: path })
    assert.equal(picture.statusCode, 200)
    assert.equal(picture.headers["content-type"], "image/png")
    assert.ok(picture.rawPayload.length > 1000 && picture.rawPayload.length < 64 * 1024)

    const forged = await app.inject({ method: "GET", url: `${path.slice(0, -3)}AAA` })
    assert.equal(forged.statusCode, 404)
    assert.equal(forged.body, "")
    const foreign = createNotificationPortraitService({ secret: "z".repeat(40), publicOrigin: "https://api.example.test" })
      .urlFor({ userId: "user_ada", loadout: cloneAvatarLoadout(DEFAULT_MALE_AVATAR_LOADOUT as AvatarLoadout) }, new Date())!
    assert.equal((await app.inject({ method: "GET", url: new URL(foreign).pathname })).statusCode, 404)
  } finally {
    await app.close()
  }
})
