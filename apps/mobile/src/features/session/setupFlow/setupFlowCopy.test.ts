import assert from "node:assert/strict"
import test from "node:test"
import { getSetupFlowCopy, type SetupFlowCopy } from "./setupFlowCopy"

function leaves(copy: SetupFlowCopy): string[] {
  const out: string[] = []
  const visit = (value: unknown) => {
    if (typeof value === "string") out.push(value)
    else if (typeof value === "function") out.push(String((value as (...args: unknown[]) => unknown)("X", true)))
    else if (value && typeof value === "object") Object.values(value).forEach(visit)
  }
  visit(copy)
  return out
}

test("every setup string exists in Turkish and English with the same shape", () => {
  const tr = leaves(getSetupFlowCopy("tr"))
  const en = leaves(getSetupFlowCopy("en"))
  assert.equal(tr.length, en.length)
  for (const text of [...tr, ...en]) assert.ok(text.trim().length > 0)
})

test("English setup copy carries no Turkish letters (no mixed-language screens)", () => {
  for (const text of leaves(getSetupFlowCopy("en"))) {
    assert.doesNotMatch(text, /[ğüşıöçĞÜŞİÖÇ]/, text)
  }
})

test("the approved Turkish strings are unchanged", () => {
  const tr = getSetupFlowCopy("tr")
  assert.equal(tr.steps.avatar.primaryAction, "Karakterim hazır")
  assert.equal(tr.avatar.headerTitle, "İlk görünümün")
  assert.equal(tr.avatar.description, "Bu sadece başlangıç. Tarzını sonra da değiştirebilirsin.")
  assert.equal(tr.studio.cycleLabel("Saç", true), "Saç için önceki görünüm")
  assert.equal(tr.stepProgress(2, 4), "Kurulum adımı 2 / 4")
})

test("English reads naturally for progress and studio controls", () => {
  const en = getSetupFlowCopy("en")
  assert.equal(en.stepProgress(2, 4), "Setup step 2 of 4")
  assert.equal(en.studio.cycleLabel("Hair", false), "Next hair look")
  assert.equal(en.signOut.title, "Sign out of Blumi?")
})
