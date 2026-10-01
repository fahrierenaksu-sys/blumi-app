import assert from "node:assert/strict"
import test from "node:test"
import {
  analyzeProfileEditDraft,
  analyzeProfileInterests,
  analyzeProfilePrompts,
  addProfileInterests,
  createMemoizedProfileEditDraftAnalyzer,
  removeProfileInterest,
  shouldConfirmProfileEditExit
} from "./profileEditModel"

const current = {
  displayName: "Defne",
  age: 24,
  bio: "Coffee walks.",
  gender: "woman",
  interests: ["coffee", "music"]
}

test("clearing optional profile fields creates explicit clear values", () => {
  const result = analyzeProfileEditDraft({
    current,
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "",
      gender: "woman",
      interestsText: ""
    }
  })

  assert.equal(result.valid, true)
  assert.equal(result.hasChanges, true)
  assert.deepEqual(result.update, {
    displayName: "Defne",
    age: 24,
    bio: "",
    gender: "woman",
    interests: []
  })
})

test("completed profiles cannot silently clear age or gender", () => {
  const missingAge = analyzeProfileEditDraft({
    current,
    draft: {
      displayName: "Defne",
      ageText: "",
      bio: "Coffee walks.",
      gender: "woman",
      interestsText: "coffee\nmusic"
    }
  })
  assert.equal(missingAge.ageValid, false)
  assert.equal(missingAge.valid, false)

  const missingGender = analyzeProfileEditDraft({
    current,
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "",
      interestsText: "coffee\nmusic"
    }
  })
  assert.equal(missingGender.genderValid, false)
  assert.equal(missingGender.valid, false)
})

test("a legacy gender value must be explicitly changed to Woman or Man before saving", () => {
  const legacy = analyzeProfileEditDraft({
    current: {
      ...current,
      gender: "non-binary"
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "non-binary",
      interestsText: "coffee\nmusic"
    }
  })
  assert.equal(legacy.genderValid, false)
  assert.equal(legacy.valid, false)
  assert.equal(legacy.update.gender, undefined)

  const changed = analyzeProfileEditDraft({
    current: {
      ...current,
      gender: "non-binary"
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "man",
      interestsText: "coffee\nmusic"
    }
  })
  assert.equal(changed.genderValid, true)
  assert.equal(changed.valid, true)
  assert.equal(changed.update.gender, "man")
})

test("normalized unchanged drafts do not create false saves", () => {
  const result = analyzeProfileEditDraft({
    current,
    draft: {
      displayName: "  Defne  ",
      ageText: "24",
      bio: " Coffee walks. ",
      gender: "woman",
      interestsText: "coffee\nmusic\ncoffee"
    }
  })

  assert.equal(result.valid, true)
  assert.equal(result.hasChanges, false)
})

test("memoized profile analysis reuses interests and prompts only across unrelated edits", () => {
  let interestParseCount = 0
  let promptAnalysisCount = 0
  const memoizedAnalyze = createMemoizedProfileEditDraftAnalyzer({
    analyzeInterests(value) {
      interestParseCount += 1
      return analyzeProfileInterests(value)
    },
    analyzePrompts(value) {
      promptAnalysisCount += 1
      return analyzeProfilePrompts(value)
    }
  })
  const input = {
    current: {
      ...current,
      prompts: [{ promptId: "small_joy" as const, answer: "Morning coffee" }]
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "woman",
      interestsText: " coffee \n music \ncoffee",
      prompts: [{ promptId: "small_joy" as const, answer: "  A slow   morning. " }]
    }
  }
  const analyzeAndCompare = (candidate: typeof input) => {
    const memoized = memoizedAnalyze(candidate)
    assert.deepEqual(memoized, analyzeProfileEditDraft(candidate))
    return memoized
  }

  const initialResult = analyzeAndCompare(input)
  assert.equal(interestParseCount, 1)
  assert.equal(promptAnalysisCount, 1)

  initialResult.interests.push("consumer mutation")
  initialResult.prompts[0]!.answer = "consumer mutation"
  const afterConsumerMutation = analyzeAndCompare(input)
  assert.deepEqual(afterConsumerMutation, analyzeProfileEditDraft(input))
  assert.equal(interestParseCount, 1)
  assert.equal(promptAnalysisCount, 1)

  for (const draft of [
    { ...input.draft, displayName: "Defne A." },
    { ...input.draft, ageText: "25" },
    { ...input.draft, bio: "A different bio." }
  ]) {
    analyzeAndCompare({ ...input, draft })
  }
  assert.equal(interestParseCount, 1)
  assert.equal(promptAnalysisCount, 1)

  const changedInterests = {
    ...input,
    draft: { ...input.draft, interestsText: "coffee\nmusic\nart" }
  }
  analyzeAndCompare(changedInterests)
  assert.equal(interestParseCount, 2)
  assert.equal(promptAnalysisCount, 1)

  const changedPrompts = {
    ...changedInterests,
    draft: {
      ...changedInterests.draft,
      prompts: [
        { promptId: "small_joy" as const, answer: "Updated   answer." },
        { promptId: "small_joy" as const, answer: "Duplicate." }
      ]
    }
  }
  const invalidPromptResult = analyzeAndCompare(changedPrompts)
  assert.equal(invalidPromptResult.promptError, "duplicate")
  assert.equal(invalidPromptResult.valid, false)
  assert.equal(interestParseCount, 2)
  assert.equal(promptAnalysisCount, 2)
})

test("editing another field preserves all ten server-supported interests", () => {
  const tenInterests = [
    "coffee",
    "music",
    "films",
    "books",
    "travel",
    "art",
    "games",
    "cooking",
    "nature",
    "dance"
  ]
  const result = analyzeProfileEditDraft({
    current: {
      ...current,
      interests: tenInterests
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "A new bio.",
      gender: "woman",
      interestsText: tenInterests.join("\n")
    }
  })

  assert.equal(result.valid, true)
  assert.equal(result.interestsValid, true)
  assert.deepEqual(result.update.interests, tenInterests)
})

test("interest validation rejects more than ten unique values after deduplication", () => {
  const elevenInterests = Array.from({ length: 11 }, (_, index) => `interest-${index + 1}`)
  const result = analyzeProfileEditDraft({
    current,
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "woman",
      interestsText: [elevenInterests[0], elevenInterests[0], ...elevenInterests].join("\n")
    }
  })

  assert.equal(result.interests.length, 11)
  assert.equal(result.interestsValid, false)
  assert.equal(result.interestError, "too-many")
  assert.equal(result.valid, false)
})

test("interest validation rejects values longer than thirty characters", () => {
  const result = analyzeProfileEditDraft({
    current,
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "woman",
      interestsText: "x".repeat(31)
    }
  })

  assert.equal(result.interestsValid, false)
  assert.equal(result.interestError, "too-long")
  assert.equal(result.valid, false)
})

test("editing another field preserves comma and pipe characters in server interests", () => {
  const delimiterInterests = ["art, design", "music|live"]
  const result = analyzeProfileEditDraft({
    current: {
      ...current,
      interests: delimiterInterests
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "A new bio.",
      gender: "woman",
      interestsText: delimiterInterests.join("\r\n")
    }
  })

  assert.equal(result.valid, true)
  assert.equal(result.hasChanges, true)
  assert.deepEqual(result.update.interests, delimiterInterests)
})

test("interest change detection compares arrays structurally", () => {
  const result = analyzeProfileEditDraft({
    current: {
      ...current,
      interests: ["a", "b|c"]
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "woman",
      interestsText: "a|b\nc"
    }
  })

  assert.equal(result.hasChanges, true)
  assert.deepEqual(result.update.interests, ["a|b", "c"])
})

test("profile prompts accept two fixed questions and reject duplicates or long answers", () => {
  const valid = analyzeProfilePrompts([
    { promptId: "small_joy", answer: "Fresh coffee and a sunny table." },
    { promptId: "ask_me_about", answer: "Tiny neighborhood restaurants." }
  ])
  assert.equal(valid.valid, true)
  assert.deepEqual(valid.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee and a sunny table." },
    { promptId: "ask_me_about", answer: "Tiny neighborhood restaurants." }
  ])

  assert.equal(analyzeProfilePrompts([
    { promptId: "small_joy", answer: "One" },
    { promptId: "small_joy", answer: "Two" }
  ]).error, "duplicate")
  assert.equal(analyzeProfilePrompts([
    { promptId: "small_joy", answer: "x".repeat(121) }
  ]).error, "too-long")
})

test("identity and discovery preferences save independently from the avatar body", () => {
  const result = analyzeProfileEditDraft({
    current: {
      ...current,
      identityGender: "woman",
      discoveryPreferences: {
        ageMin: 23,
        ageMax: 35,
        genders: ["man"],
        vibes: ["coffee"],
        radiusKm: 25
      }
    },
    draft: {
      displayName: "Defne",
      ageText: "24",
      bio: "Coffee walks.",
      gender: "man",
      interestsText: "coffee\nmusic",
      discoveryGenders: ["woman"],
      radiusKm: 50
    }
  })

  assert.equal(result.valid, true)
  assert.equal(result.hasChanges, true)
  assert.equal(result.update.identityGender, "man")
  assert.equal(result.update.gender, "man")
  assert.deepEqual(result.update.discoveryPreferences, {
    ageMin: 23,
    ageMax: 35,
    genders: ["woman"],
    vibes: ["coffee"],
    radiusKm: 50
  })
  assert.equal("avatarPresetId" in result.update, false)
})

test("DSC-9: interest chips add typed entries (comma or return) and remove one at a time", () => {
  assert.equal(addProfileInterests("coffee", "films"), "coffee\nfilms")
  assert.equal(addProfileInterests("", " live music , hiking,"), "live music\nhiking")
  assert.equal(addProfileInterests("coffee", "coffee"), "coffee", "an exact duplicate is not added twice")
  assert.equal(addProfileInterests("coffee", "   "), "coffee")
  assert.equal(removeProfileInterest("coffee\nfilms\nhiking", "films"), "coffee\nhiking")
  assert.equal(removeProfileInterest("coffee", "missing"), "coffee")
  // Over-limit entries are kept so the field's validation explains them.
  const eleven = Array.from({ length: 11 }, (_, index) => `i${index}`).join(",")
  assert.equal(analyzeProfileInterests(addProfileInterests("", eleven)).error, "too-many")
})

test("DSC-9: leaving with unsaved edits asks first, never while saving or after a save", () => {
  assert.equal(shouldConfirmProfileEditExit({ hasChanges: true, isSaving: false, saved: false }), true)
  assert.equal(shouldConfirmProfileEditExit({ hasChanges: false, isSaving: false, saved: false }), false)
  assert.equal(shouldConfirmProfileEditExit({ hasChanges: true, isSaving: true, saved: false }), false)
  assert.equal(shouldConfirmProfileEditExit({ hasChanges: true, isSaving: false, saved: true }), false)
})
