import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { getLegalContent } from "../../mobile/src/features/legal/legalCopy.ts"
import {
  LEGAL_DOCUMENT_VERSION,
  LEGAL_HOSTED_PAGE_URLS,
  LEGAL_OPERATOR_IDENTITY
} from "../../mobile/src/features/legal/legalPolicyMetadata.ts"

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDir = resolve(serverRoot, "dist/legal-pages")
const pages = {
  privacy: {
    tr: getLegalContent("tr", "privacy"),
    en: getLegalContent("en", "privacy")
  },
  terms: {
    tr: getLegalContent("tr", "terms"),
    en: getLegalContent("en", "terms")
  },
  "child-safety": {
    tr: getLegalContent("tr", "guidelines"),
    en: getLegalContent("en", "guidelines")
  }
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function renderPage(locale, title, body, alternateUrl) {
  const nav = locale === "tr"
    ? ["Gizlilik", "Koşullar", "Topluluk ve güvenlik", "Destek", "Hesap silme"]
    : ["Privacy", "Terms", "Community and safety", "Support", "Delete account"]
  const links = [
    LEGAL_HOSTED_PAGE_URLS.privacyUrl,
    LEGAL_HOSTED_PAGE_URLS.termsUrl,
    LEGAL_HOSTED_PAGE_URLS.communityUrl,
    LEGAL_HOSTED_PAGE_URLS.supportUrl,
    LEGAL_HOSTED_PAGE_URLS.deleteAccountUrl
  ]
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(title)} · Blumi</title>
  <style>body{margin:0;background:#fffafa;color:#292431;font:16px/1.65 system-ui,-apple-system,sans-serif}header,main,footer{max-width:820px;margin:auto;padding:20px}header{border-bottom:1px solid #eadfe3}nav{display:flex;flex-wrap:wrap;gap:12px}a{color:#764d73}main{padding-top:32px;padding-bottom:48px}h1{font-size:2rem;line-height:1.2}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}footer{border-top:1px solid #eadfe3;font-size:.9rem}a:focus-visible{outline:3px solid #764d73;outline-offset:3px}</style>
</head>
<body>
  <header><strong>Blumi</strong><nav aria-label="${locale === "tr" ? "Yasal bağlantılar" : "Legal links"}">${links.map((link, index) => `<a href="${escapeHtml(link)}">${nav[index]}</a>`).join(" ")}</nav></header>
  <main><p><a href="${escapeHtml(alternateUrl)}">${locale === "tr" ? "English" : "Türkçe"}</a></p><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></main>
  <footer>${escapeHtml(LEGAL_OPERATOR_IDENTITY.legalName)} · ${escapeHtml(LEGAL_OPERATOR_IDENTITY.operatingCountry)} · <a href="mailto:${escapeHtml(LEGAL_OPERATOR_IDENTITY.privacyContact)}">${escapeHtml(LEGAL_OPERATOR_IDENTITY.privacyContact)}</a> · ${LEGAL_DOCUMENT_VERSION}</footer>
</body>
</html>`
}

await mkdir(outputDir, { recursive: true })
for (const [name, localized] of Object.entries(pages)) {
  for (const locale of ["tr", "en"]) {
    const document = localized[locale]
    const path = resolve(outputDir, `${name}-${locale}.html`)
    const alternateUrl = name === "privacy"
      ? LEGAL_HOSTED_PAGE_URLS.privacyUrl
      : name === "terms"
        ? LEGAL_HOSTED_PAGE_URLS.termsUrl
        : LEGAL_HOSTED_PAGE_URLS.communityUrl
    await writeFile(path, renderPage(locale, document.title, document.body,
      `${alternateUrl}?lang=${locale === "tr" ? "en" : "tr"}`), "utf8")
  }
}

const utilityPages = {
  support: {
    tr: ["Destek", `Blumi destek ve gizlilik başvuruları için ${LEGAL_OPERATOR_IDENTITY.privacyContact} adresine yazabilirsiniz. Hesap silme ve veri dışa aktarma işlemleri uygulama Ayarlar ekranındadır. Acil tehlikede yerel acil servise başvurun. E-posta ile parola veya tek kullanımlık kod göndermeyin.`],
    en: ["Support", `For Blumi support and privacy requests, email ${LEGAL_OPERATOR_IDENTITY.privacyContact}. Account deletion and data export are available in the app's Settings. For immediate danger, contact local emergency services. Never send passwords or one-time codes by email.`]
  },
  "delete-account": {
    tr: ["Hesap silme", `Blumi hesabını uygulamada Ayarlar → Hesabı sil yolundan, giriş telefonuna gelen yeni doğrulama kodunu onaylayarak silebilirsin. Uygulamaya erişemiyorsan ${LEGAL_OPERATOR_IDENTITY.privacyContact} adresine yaz. Silme, kanunen saklanması gereken kayıtlar ve belgeli hukuki muhafaza istisnaları dışında aktif hesap verilerini kaldırır. Ayrıntılar Gizlilik Metni'ndedir.`],
    en: ["Delete your account", `Delete your Blumi account in Settings → Delete account after confirming a fresh code sent to your sign-in phone. If you cannot access the app, email ${LEGAL_OPERATOR_IDENTITY.privacyContact}. Active account data is removed except records that must be retained by law or a documented legal hold. See the Privacy Notice for details.`]
  }
}
for (const [name, localized] of Object.entries(utilityPages)) {
  for (const locale of ["tr", "en"]) {
    const [title, body] = localized[locale]
    const baseUrl = name === "support"
      ? LEGAL_HOSTED_PAGE_URLS.supportUrl
      : LEGAL_HOSTED_PAGE_URLS.deleteAccountUrl
    await writeFile(resolve(outputDir, `${name}-${locale}.html`), renderPage(
      locale, title, body, `${baseUrl}?lang=${locale === "tr" ? "en" : "tr"}`
    ), "utf8")
  }
}
