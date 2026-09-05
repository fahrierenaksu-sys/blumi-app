import assert from "node:assert/strict"
import test from "node:test"
import { buildLegalDocumentLines } from "./legalDocumentModel"

test("legal document model exposes semantic headings, bullets, notices, and body text", () => {
  const lines = buildLegalDocumentLines(`Blumi Privacy Notice
Version: 1

DRAFT — NOT APPROVED FOR PRODUCTION

1. Data Controller and Contact
Data controller: Example

• First requirement`)

  assert.deepEqual(lines.map((line) => line.kind), [
    "document-title",
    "metadata",
    "spacer",
    "warning",
    "spacer",
    "section-heading",
    "paragraph",
    "spacer",
    "bullet"
  ])
  assert.equal(lines[5]?.accessibilityRole, "header")
  assert.equal(lines[8]?.text, "First requirement")
})

test("legal document model recognizes Turkish headings without a hard-coded title list", () => {
  const lines = buildLegalDocumentLines(`Blumi Topluluk Kuralları
Sürüm: 1

Yalnız Yetişkinler
• En az 18 yaşında olmalısın`)

  assert.equal(lines[0]?.kind, "document-title")
  assert.equal(lines[1]?.kind, "metadata")
  assert.equal(lines[3]?.kind, "section-heading")
  assert.equal(lines[4]?.kind, "bullet")
})
