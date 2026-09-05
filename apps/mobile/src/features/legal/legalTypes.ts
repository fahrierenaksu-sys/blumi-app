import type { AppLocale } from "../session/appLocale"

export type LegalContentType = "privacy" | "terms" | "guidelines"

export type LegalDocumentStatus = "draft-blocked" | "effective"

export interface LegalContent {
  title: string
  body: string
  version: string
  effectiveDate: string
  status: LegalDocumentStatus
}

export type LocalizedLegalContent = Readonly<Record<AppLocale, LegalContent>>
