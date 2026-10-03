import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../testing/hookHarness"
import type * as ModalModule from "./MatchResultModal"

// The root clears its match the moment the pop-up is dismissed, while the
// Modal still fades out for a few hundred ms. The pop-up must keep showing the
// last match during the fade instead of flashing the empty fallback.

type Props = Parameters<typeof ModalModule.MatchResultModal>[0]
type Element = { type: unknown; props: Record<string, unknown> }

const MODAL = "Modal"

function mount() {
  const runtime = createFakeReactRuntime()
  const presentedNames: string[] = []
  const snapshotNames: string[] = []
  const { MatchResultModal } = loadSourceWithFakeReact<typeof ModalModule>("components/MatchResultModal.tsx", runtime, {
    inertUnknown: true,
    modules: {
      "react-native": { Modal: MODAL, Pressable: "Pressable", Text: "Text", View: "View", StyleSheet: { create: <T>(styles: T) => styles, absoluteFill: {}, hairlineWidth: 1 } },
      "../ui/animations": { useReducedMotion: () => false },
      "../features/matches/useMatchMeeting": { useMatchMeeting: () => ({ start: () => undefined, partnerArrived: () => undefined }) },
      "../features/matches/matchFlightSource": { matchFlightSources: { take: () => null } },
      "../features/matches/matchMeetingModel": { MATCH_CONFETTI_PIECES: 0, planMatchMeeting: () => ({ partnerArrival: "slide" }) },
      "../features/matches/matchResultPresentation": {
        getMatchCelebrationMotion: () => ({
          modalAnimationType: "fade",
          confetti: false,
          entranceFromScale: 1,
          entranceFromOpacity: 1,
          contentStaggerMs: 0,
          entranceOpacityDurationMs: 0,
          entranceSpringConfig: {},
          heartPulseIterations: 0
        }),
        getMatchResultPresentation: (input: { matchedUserName: string }) => {
          presentedNames.push(input.matchedUserName)
          return { actions: [{ label: "a" }, { label: "b" }], avatarLabel: "label", closeLabel: "close" }
        },
        shouldPlayMatchHaptic: (previous: boolean, next: boolean) => !previous && next
      },
      "./DiscoverCard": {
        CandidateAvatarPreview: "CandidateAvatarPreview",
        createCandidateAvatarSnapshot: (input: { displayName: string }) => {
          snapshotNames.push(input.displayName)
          return { displayName: input.displayName }
        }
      }
    }
  })
  const base: Props = {
    visible: false,
    currentUserName: "Me",
    matchedUserName: "",
    onClose: () => undefined,
    onKeepDiscovering: () => undefined,
    onSendMessage: () => undefined
  }
  const render = (overrides: Partial<Props>) => runtime.render(() => MatchResultModal({ ...base, ...overrides })) as Element
  return { render, presentedNames, snapshotNames }
}

test("the pop-up keeps the last match while it fades out after the match is cleared", () => {
  const f = mount()
  const shown = f.render({ visible: true, matchedUserName: "Ada", matchedUserId: "user-ada" })
  assert.equal(shown.type, MODAL)
  assert.equal(shown.props.visible, true)

  // The root clears the match: visible flips and the match props fall back.
  const fading = f.render({ visible: false, matchedUserName: "", matchedUserId: undefined })
  assert.equal(fading.props.visible, false)
  assert.equal(f.presentedNames.at(-1), "Ada")
  assert.equal(f.snapshotNames.at(-1), "Ada")
})

test("a new match replaces the retained one and a never-shown pop-up has no stale match", () => {
  const f = mount()
  f.render({ visible: false, matchedUserName: "" })
  assert.equal(f.presentedNames.at(-1), "")
  f.render({ visible: true, matchedUserName: "Ada", matchedUserId: "user-ada" })
  f.render({ visible: false, matchedUserName: "" })
  f.render({ visible: true, matchedUserName: "Bo", matchedUserId: "user-bo" })
  assert.equal(f.presentedNames.at(-1), "Bo")
  f.render({ visible: false, matchedUserName: "" })
  assert.equal(f.presentedNames.at(-1), "Bo")
})
