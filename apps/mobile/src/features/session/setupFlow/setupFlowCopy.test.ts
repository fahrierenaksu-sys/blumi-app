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
