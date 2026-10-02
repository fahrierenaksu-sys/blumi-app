import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

// The Discover header used to carry a decorative 48 px profile-chip avatar that
// had to yield image priority to the front card. The chip moved to My Room (the
// single profile entry), so the front card is the only avatar Discover loads
// first, and startup no longer waits for a header image.
const headerSource = readFileSync(new URL("../features/discovery/screen/DiscoverHomeHeader.tsx", import.meta.url), "utf8")
const lobbyScreenSource = readFileSync(new URL("./LobbyScreen.tsx", import.meta.url), "utf8")
const frontDeckSource = readFileSync(new URL("../features/discovery/DiscoveryDeckView.tsx", import.meta.url), "utf8")
const startupSource = readFileSync(new URL("../features/discovery/screen/useDiscoveryStartup.ts", import.meta.url), "utf8")

test("Discover's visible front card is the only avatar competing for high image priority", () => {
  assert.match(lobbyScreenSource, /<DiscoverHomeHeader\b/)
  assert.doesNotMatch(headerSource, /CandidateAvatarPreview|imagePriority/)
  assert.match(frontDeckSource, /imagePriority=\{isTop \? "high" : "low"\}/)
})

test("Discover startup waits only for images it actually shows", () => {
  assert.doesNotMatch(startupSource, /:header`/)
  assert.match(startupSource, /chromeReady: areDiscoveryImagesDisplayed\(\[`\$\{startupScope\}:background`\], imageReceipts\)/)
})
