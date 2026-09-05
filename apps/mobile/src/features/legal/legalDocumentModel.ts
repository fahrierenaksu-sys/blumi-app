export type LegalDocumentLineKind =
  | "document-title"
  | "metadata"
  | "warning"
  | "section-heading"
  | "paragraph"
  | "bullet"
  | "spacer"

export interface LegalDocumentLine {
  key: string
  kind: LegalDocumentLineKind
  text: string
  accessibilityRole?: "header"
}

const METADATA_PREFIX = /^(?:Version|Effective date|Sürüm|Yürürlük tarihi):/i
const WARNING_PREFIX = /^(?:DRAFT|TASLAK)\b/i
const NUMBERED_HEADING = /^\d+\.\s+\S/
const BULLET = /^•\s*/

export function buildLegalDocumentLines(body: string): readonly LegalDocumentLine[] {
  const sourceLines = body.split("\n")
  let firstContentSeen = false

  return sourceLines.map((rawLine, index) => {
    const text = rawLine.trim()
    const key = `legal-line-${index}`

    if (!text) {
      return { key, kind: "spacer", text: "" }
    }

    if (!firstContentSeen) {
      firstContentSeen = true
      return { key, kind: "document-title", text, accessibilityRole: "header" }
    }

    if (METADATA_PREFIX.test(text)) {
      return { key, kind: "metadata", text }
    }

    if (WARNING_PREFIX.test(text)) {
      return { key, kind: "warning", text }
    }

    if (NUMBERED_HEADING.test(text) || isShortStandaloneHeading(sourceLines, index, text)) {
      return { key, kind: "section-heading", text, accessibilityRole: "header" }
    }

    if (BULLET.test(text)) {
      return { key, kind: "bullet", text: text.replace(BULLET, "") }
    }

    return { key, kind: "paragraph", text }
  })
}

function isShortStandaloneHeading(
  sourceLines: readonly string[],
  index: number,
  text: string
): boolean {
  if (index === 0 || sourceLines[index - 1]?.trim() !== "") return false
  if (!sourceLines[index + 1]?.trim()) return false
  if (text.length > 64 || /[.!?:;]$/.test(text)) return false
  return text.split(/\s+/).length <= 8
}
