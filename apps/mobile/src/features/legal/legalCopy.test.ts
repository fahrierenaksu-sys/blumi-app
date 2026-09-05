import assert from "node:assert/strict"
import test from "node:test"
import { getAllLegalContent, getLegalContent } from "./legalCopy"
import {
  getLegalReleaseBlockers,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_REQUIRED_MARKER
} from "./legalPolicyMetadata"

test("legal copy discloses consumable coin economics without promising restore purchases", () => {
  for (const locale of ["en", "tr"] as const) {
    const privacy = getLegalContent(locale, "privacy")
    const terms = getLegalContent(locale, "terms")
    assert.match(privacy.body, /RevenueCat|RevenueCat/i)
    assert.match(terms.body, /coin|jeton/i)
    assert.doesNotMatch(terms.body, /restore purchases/i)
  }
})

test("privacy copy discloses controller identity, processing paths, rights, and named providers", () => {
  const enPrivacy = getLegalContent("en", "privacy")
  const trPrivacy = getLegalContent("tr", "privacy")

  assert.match(enPrivacy.body, /data controller/i)
  assert.match(enPrivacy.body, /phone number|display name|messages|reports/i)
  assert.match(enPrivacy.body, /PostHog|product analytics/i)
  assert.match(enPrivacy.body, /Sentry|crash/i)
  assert.match(enPrivacy.body, /LiveKit|live audio/i)
  assert.match(enPrivacy.body, /Twilio|one-time code/i)
  assert.match(enPrivacy.body, /Expo|push notification/i)
  assert.match(enPrivacy.body, /Apple|Google/i)
  assert.match(enPrivacy.body, /legal basis|contract|legitimate interest|explicit consent/i)
  assert.match(enPrivacy.body, /cross-border|outside T(?:ü|u)rkiye|international transfer/i)
  assert.match(enPrivacy.body, /matching|profiling|recommendation/i)
  assert.match(enPrivacy.body, /retention|retain/i)
  assert.match(enPrivacy.body, /account-data export|delete your account|rights/i)
  assert.match(enPrivacy.body, /support page|privacy choices/i)

  assert.match(trPrivacy.body, /veri sorumlusu/i)
  assert.match(trPrivacy.body, /telefon numarası|görünen ad|mesajlar|raporlar/i)
  assert.match(trPrivacy.body, /PostHog|ürün analitiği/i)
  assert.match(trPrivacy.body, /Sentry|çökme/i)
  assert.match(trPrivacy.body, /LiveKit|canlı ses/i)
  assert.match(trPrivacy.body, /Twilio|tek kullanımlık kod/i)
  assert.match(trPrivacy.body, /Expo|anlık bildirim/i)
  assert.match(trPrivacy.body, /Apple|Google/i)
  assert.match(trPrivacy.body, /hukuki sebep|sözleşme|meşru menfaat|açık rıza/i)
  assert.match(trPrivacy.body, /yurt dışı|sınır ötesi/i)
  assert.match(trPrivacy.body, /eşleştirme|profilleme|öneri/i)
  assert.match(trPrivacy.body, /saklama/i)
  assert.match(trPrivacy.body, /hesap verisi dışa aktarımı|hesabını silebilirsin|hakların/i)
  assert.match(trPrivacy.body, /destek sayfası|gizlilik tercihleri/i)
})

test("terms copy covers eligibility, safety, virtual items, and dispute boundaries", () => {
  const enTerms = getLegalContent("en", "terms")
  const trTerms = getLegalContent("tr", "terms")

  assert.match(enTerms.body, /18 years old/i)
  assert.match(enTerms.body, /mutual interest|live audio/i)
  assert.match(enTerms.body, /virtual|licensed/i)
  assert.match(enTerms.body, /suspend|terminate/i)
  assert.match(enTerms.body, /user content|license/i)
  assert.match(enTerms.body, /report|block|appeal/i)
  assert.match(enTerms.body, /offline|in-person|emergency/i)
  assert.match(enTerms.body, /mandatory consumer rights/i)
  assert.match(enTerms.body, /indemnif|liable|governing law|contact/i)
  assert.doesNotMatch(enTerms.body, /not liable for any damages/i)

  assert.match(trTerms.body, /18 yaş/i)
  assert.match(trTerms.body, /karşılıklı ilgi|canlı ses/i)
  assert.match(trTerms.body, /sanal|lisans/i)
  assert.match(trTerms.body, /askıya al|sonlandır/i)
  assert.match(trTerms.body, /kullanıcı içeriği|lisans/i)
  assert.match(trTerms.body, /bildir|engelle|itiraz/i)
  assert.match(trTerms.body, /çevrim dışı|yüz yüze|acil/i)
  assert.match(trTerms.body, /emredici tüketici hakları/i)
  assert.match(trTerms.body, /tazmin|sorumluluk|uygulanacak hukuk|iletişim/i)
})

test("legal bundle is versioned, bilingual, consent-safe, and effective", () => {
  const documents = getAllLegalContent()

  for (const locale of ["en", "tr"] as const) {
    for (const type of ["privacy", "terms", "guidelines"] as const) {
      const document = documents[locale][type]
      assert.equal(document.version, LEGAL_DOCUMENT_VERSION)
      assert.equal(document.status, "effective")
      assert.ok(document.effectiveDate.length > 0)
      assert.ok(document.body.length > 1_000)
    }
  }

  assert.doesNotMatch(
    JSON.stringify(documents),
    new RegExp(LEGAL_REQUIRED_MARKER.replace("[", "\\["))
  )
  assert.match(documents.en.privacy.body, /privacy notice is not a request for consent/i)
  assert.match(documents.tr.privacy.body, /aydınlatma metni.*açık rıza talebi değildir/i)
  assert.match(documents.en.guidelines.body, /child sexual abuse|minor|doxx|record/i)
  assert.match(documents.tr.guidelines.body, /çocukların cinsel istismarı|reşit olmayan|kişisel bilgi|kayıt/i)

  const blockers = getLegalReleaseBlockers(JSON.stringify(documents))
  assert.ok(blockers.some((blocker) => /hosted legal copy/i.test(blocker)))
})

test("user-facing legal copy contains no draft or production-review language", () => {
  const documents = getAllLegalContent()
  const visibleCopy = [
    documents.en.privacy.body,
    documents.en.terms.body,
    documents.en.guidelines.body,
    documents.tr.privacy.body,
    documents.tr.terms.body,
    documents.tr.guidelines.body
  ].join("\n")

  assert.doesNotMatch(visibleCopy, /DRAFT|TASLAK/i)
  assert.doesNotMatch(
    visibleCopy,
    /NOT APPROVED FOR PRODUCTION|ÜRETİM İÇİN ONAYLI DEĞİLDİR/i
  )
  assert.doesNotMatch(visibleCopy, /counsel approval|avukat onayı/i)
})

test("terms use narrow enforceable protections instead of blanket immunity", () => {
  const enTerms = getLegalContent("en", "terms").body
  const trTerms = getLegalContent("tr", "terms").body

  assert.match(enTerms, /gross negligence|mandatory consumer rights/i)
  assert.match(trTerms, /ağır kusur|emredici tüketici hakkı/i)
  assert.match(enTerms, /not an independently collected money debt/i)
  assert.match(trTerms, /ayrıca tahsil edilen bir para borcu değildir/i)
  assert.doesNotMatch(enTerms, /not liable for any|all liability is excluded/i)
  assert.doesNotMatch(trTerms, /hiçbir zarardan sorumlu değildir|tüm sorumluluk dışlanır/i)
})
