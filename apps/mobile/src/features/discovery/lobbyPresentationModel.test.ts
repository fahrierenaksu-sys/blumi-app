import assert from "node:assert/strict"
import test from "node:test"
import {
  buildProfileCues,
  countActiveDiscoverFilters,
  distanceLabelOf,
  inviteReadinessLabel
} from "./lobbyPresentationModel"
import { DEFAULT_DISCOVERY_FILTERS } from "./discoveryFiltersModel"
import { createLiveDiscoveryCandidate } from "./discoveryCandidateModel"

test("discovery filter count only reports changed filter groups", () => {
  assert.equal(countActiveDiscoverFilters(DEFAULT_DISCOVERY_FILTERS), 0)
  assert.equal(
    countActiveDiscoverFilters({
      ...DEFAULT_DISCOVERY_FILTERS,
      ageMin: 24,
      genders: ["woman"]
    }),
    2
  )
  assert.equal(
    countActiveDiscoverFilters({
      ...DEFAULT_DISCOVERY_FILTERS,
      vibes: ["Bookish"]
    }),
    1
  )
})

test("discovery distance copy stays short and fail-closed", () => {
  assert.equal(distanceLabelOf(undefined), "Location private")
  assert.equal(distanceLabelOf(Number.NaN), "Location private")
  assert.equal(distanceLabelOf(42), "Very close")
  assert.equal(distanceLabelOf(210), "210m away")
  assert.equal(distanceLabelOf(900), "In the area")
})

test("invite readiness follows candidate capability and block state", () => {
  const ready = createLiveDiscoveryCandidate({
    userId: "ready",
    displayName: "Ready",
    spotId: "spot-ready",
    distance: 40,
    canInvite: true,
    blocked: false
  })
  const blocked = createLiveDiscoveryCandidate({
    userId: "blocked",
    displayName: "Blocked",
    spotId: "spot-blocked",
    distance: 40,
    canInvite: true,
    blocked: true
  })
  const unavailable = createLiveDiscoveryCandidate({
    userId: "unavailable",
    displayName: "Unavailable",
    spotId: "spot-unavailable",
    distance: 40,
    canInvite: false,
    blocked: false
  })

  assert.equal(inviteReadinessLabel(ready), "Ready for an invite")
  assert.equal(inviteReadinessLabel(blocked), "Hidden for now")
  assert.equal(inviteReadinessLabel(unavailable), "Say hi first")
})

test("profile cues stay demo-only and explain live room readiness", () => {
  const candidate = createLiveDiscoveryCandidate({
    userId: "cue-user",
    displayName: "Cue User",
    spotId: "cue-spot",
    distance: 40,
    canInvite: true,
    blocked: false
  })

  assert.deepEqual(buildProfileCues(candidate, "Very close", true), [])
  assert.deepEqual(buildProfileCues(candidate, "Very close", false), [
    {
      id: "live_overlap",
      label: "Live lobby",
      value: "Here now",
      detail: "You are seeing this person because they are active in the lobby."
    },
    {
      id: "proximity",
      label: "Close by",
      value: "Very close",
      detail: "Distance is calculated from the live lobby presence shared for this session."
    },
    {
      id: "room_readiness",
      label: "Shared room",
      value: "Ready for an invite",
      detail: "If they accept, a shared room opens for just the two of you."
    }
  ])
})
