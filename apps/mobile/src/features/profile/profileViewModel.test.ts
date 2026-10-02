import assert from "node:assert/strict"
import test from "node:test"
import {
  getProfilePromptQuestion,
  isProfilePreviewContext,
  resolveMatchedChatNavigation,
  resolveOwnProfileSections,
  resolvePreviewTags,
  resolveProfileCompleteness,
  resolveProfilePreviewActions,
  resolveProfilePreviewContext,
  shouldShowProfileSafety
} from "./profileViewModel"
import {
  getProfileHeroParallax,
  getProfileSectionEntranceDelay
} from "./profileMotionModel"

test("an empty profile shows an add affordance for every section and no blank cards", () => {
  const sections = resolveOwnProfileSections({ bio: "  ", interests: [" ", ""], prompts: [] }, "en")
  assert.equal(sections.bio, null)
  assert.deepEqual(sections.interests, [])
  assert.deepEqual(sections.prompts, [])
  assert.equal(sections.showAddBio, true)
  assert.equal(sections.showAddInterests, true)
  assert.equal(sections.showAddPrompt, true)
  assert.deepEqual(sections.completeness, {
    done: 1,
    total: 5,
    percent: 20,
    complete: false,
    nextStep: "bio"
  })
})

test("filled sections render what the user wrote and hide their add affordance", () => {
  const sections = resolveOwnProfileSections({
    bio: "  Tea, long walks and bad puns. ",
    interests: ["Coffee", "coffee", " Films "],
    prompts: [
      { promptId: "ask_me_about", answer: "Kites" },
      { promptId: "ideal_sunday", answer: "Market, nap, board games" }
    ]
  }, "en")
  assert.equal(sections.bio, "Tea, long walks and bad puns.")
  assert.deepEqual(sections.interests, ["Coffee", "Films"])
  assert.deepEqual(sections.prompts.map(({ id, answer }) => [id, answer]), [
    ["ask_me_about", "Kites"],
    ["ideal_sunday", "Market, nap, board games"]
  ])
  assert.equal(sections.showAddBio, false)
  assert.equal(sections.showAddInterests, false)
  assert.equal(sections.showAddPrompt, false)
  assert.equal(sections.completeness.complete, true)
  assert.equal(sections.completeness.percent, 100)
  assert.equal(sections.completeness.nextStep, null)
})

test("one answered prompt keeps the prompt add affordance and names it as the next step", () => {
  const sections = resolveOwnProfileSections({
    bio: "Hi",
    interests: ["Books"],
    prompts: [{ promptId: "small_joy", answer: "Warm bread" }]
  }, "en")
  assert.equal(sections.prompts.length, 1)
  assert.equal(sections.showAddPrompt, true)
  assert.equal(sections.completeness.nextStep, "prompt")
  assert.equal(sections.completeness.done, 4)
})

test("completeness invites the steps in order: bio, interests, then prompts", () => {
  assert.equal(resolveProfileCompleteness({ hasBio: false, interestCount: 3, promptCount: 2 }).nextStep, "bio")
  assert.equal(resolveProfileCompleteness({ hasBio: true, interestCount: 0, promptCount: 2 }).nextStep, "interests")
  assert.equal(resolveProfileCompleteness({ hasBio: true, interestCount: 2, promptCount: 0 }).nextStep, "prompt")
  // More prompts than the limit never count past 100%.
  assert.equal(resolveProfileCompleteness({ hasBio: true, interestCount: 2, promptCount: 9 }).percent, 100)
})

test("prompt questions follow the locale and unknown or empty prompts are dropped", () => {
  assert.equal(getProfilePromptQuestion("ideal_sunday", "tr"), "İdeal pazar günüm...")
  assert.equal(getProfilePromptQuestion("ideal_sunday", "en"), "My ideal Sunday looks like...")
  const sections = resolveOwnProfileSections({
    prompts: [
      { promptId: "small_joy", answer: "   " },
      { promptId: "not_a_prompt" as never, answer: "x" },
      { promptId: "ask_me_about", answer: "Kites" }
    ]
  }, "tr")
  assert.deepEqual(sections.prompts, [{ id: "ask_me_about", question: "Bana şunu sor...", answer: "Kites" }])
})

test("preview tags render once, without duplicates or blanks", () => {
  assert.deepEqual(resolvePreviewTags(["Bookish", "bookish", " ", "Pets"]), ["Bookish", "Pets"])
})

test("the viewer's own profile is always the self context, whatever the route asked", () => {
  for (const requested of [undefined, "discover", "matched", "self"]) {
    assert.equal(resolveProfilePreviewContext({ requested, isSelf: true, previousRouteName: "ChatThread" }), "self")
  }
})

test("an explicit context wins; without one a profile over a chat is a match", () => {
  assert.equal(resolveProfilePreviewContext({ requested: "matched", isSelf: false, previousRouteName: "Lobby" }), "matched")
  assert.equal(resolveProfilePreviewContext({ requested: "discover", isSelf: false, previousRouteName: "ChatThread" }), "discover")
  assert.equal(resolveProfilePreviewContext({ isSelf: false, previousRouteName: "ChatThread" }), "matched")
  assert.equal(resolveProfilePreviewContext({ isSelf: false, previousRouteName: "Lobby" }), "discover")
  assert.equal(resolveProfilePreviewContext({ isSelf: false }), "discover")
  // "self" cannot be forced onto someone else's profile.
  assert.equal(resolveProfilePreviewContext({ requested: "self", isSelf: false, previousRouteName: "Lobby" }), "discover")
  assert.equal(resolveProfilePreviewContext({ requested: "bogus", isSelf: false }), "discover")
  assert.equal(isProfilePreviewContext("matched"), true)
  assert.equal(isProfilePreviewContext("other"), false)
})

test("discover offers Pass / Say hi, disabled with a notice when the server says view-only", () => {
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "discover", blocked: false, decisionCapability: "live-invite", productionDiscovery: true }),
    { kind: "decide", likeEnabled: true, showViewOnlyNotice: false }
  )
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "discover", blocked: false, decisionCapability: "view-only", productionDiscovery: true }),
    { kind: "decide", likeEnabled: false, showViewOnlyNotice: true }
  )
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "discover", blocked: false, decisionCapability: "mutual-like", serverDeniedDecision: true, productionDiscovery: true }),
    { kind: "decide", likeEnabled: false, showViewOnlyNotice: true }
  )
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "discover", blocked: true, decisionCapability: "live-invite", productionDiscovery: false }),
    { kind: "decide", likeEnabled: false, showViewOnlyNotice: false }
  )
})

test("a match gets back-to-chat and invite instead of a disabled Say hi; self gets no actions", () => {
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "matched", blocked: false, decisionCapability: "view-only", productionDiscovery: true }),
    { kind: "matched", canInvite: true }
  )
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "matched", blocked: true, decisionCapability: "view-only", productionDiscovery: true }),
    { kind: "matched", canInvite: false }
  )
  assert.deepEqual(
    resolveProfilePreviewActions({ context: "self", blocked: false, decisionCapability: "live-invite", productionDiscovery: true }),
    { kind: "none" }
  )
  assert.equal(shouldShowProfileSafety("self"), false)
  assert.equal(shouldShowProfileSafety("matched"), true)
  assert.equal(shouldShowProfileSafety("discover"), true)
})

test("back to chat pops to the chat below, or opens the partner's chat", () => {
  const partner = { userId: "partner-a", displayName: "Ada" }
  assert.deepEqual(
    resolveMatchedChatNavigation({ previousRoute: { name: "ChatThread", params: { threadId: "t-1" } }, partner }),
    { kind: "back" }
  )
  assert.deepEqual(
    resolveMatchedChatNavigation({ previousRoute: { name: "Inbox" }, partner }),
    { kind: "navigate", params: { partnerId: "partner-a", partnerName: "Ada" } }
  )
})

test("invite to room returns to the chat with a one-shot request and keeps its thread", () => {
  const partner = { userId: "partner-a", displayName: "Ada" }
  assert.deepEqual(
    resolveMatchedChatNavigation({
      previousRoute: { name: "ChatThread", params: { threadId: "t-1", partnerName: "Ada" } },
      partner,
      inviteRequest: "r1"
    }),
    { kind: "popTo", params: { threadId: "t-1", partnerName: "Ada", roomInviteRequest: "r1" } }
  )
  assert.deepEqual(
    resolveMatchedChatNavigation({ previousRoute: undefined, partner, inviteRequest: "r2" }),
    { kind: "navigate", params: { partnerId: "partner-a", partnerName: "Ada", roomInviteRequest: "r2" } }
  )
})

test("hero parallax and section entrances stand still under Reduce Motion", () => {
  assert.deepEqual(getProfileHeroParallax(200, true), { translateY: 0, opacity: 1 })
  assert.deepEqual(getProfileHeroParallax(-40, false), { translateY: 0, opacity: 1 })
  const moving = getProfileHeroParallax(200, false)
  assert.ok(moving.translateY > 0 && moving.translateY < 200, "the chibi trails the scroll")
  assert.ok(moving.opacity < 1 && moving.opacity >= 0.5)
  assert.ok(getProfileHeroParallax(10_000, false).opacity >= 0.5)
  assert.equal(getProfileSectionEntranceDelay(3, true), null)
  const first = getProfileSectionEntranceDelay(0, false)
  const second = getProfileSectionEntranceDelay(1, false)
  assert.ok(first !== null && second !== null && second > first, "sections enter one after another")
})
