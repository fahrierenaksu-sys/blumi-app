# Blumi launch control

**Current verdict: not ready for public release.** The Operations Center is a read-only view of this evidence snapshot, not live provider telemetry or a production admin console. External systems remain unverified until connected. Follow the [reusable release-captain workflow](./RELEASE_CAPTAIN_WORKFLOW.md); detailed infrastructure steps and evidence live in [`railway-supabase-launch.md`](./railway-supabase-launch.md).

Snapshot: 2026-09-28. Recheck volatile statuses before acting. The status table and ordered checklist below this infrastructure update are historical release-planning items, not live provider telemetry.

## Infrastructure setup update — 2026-09-28

This update supersedes the older infrastructure/account snapshot below, not its release gates.

### Latest decision — test deployment with payments and voice deferred

**Test server status, 2026-09-28:** [Railway HTTPS test endpoint](https://blumi-app-production.up.railway.app) is active. External `/health` and `/ready` returned HTTP 200; unauthenticated `/v1/users/me`, `/v1/admin/session` and `/v1/economy/balance` returned HTTP 401. Railway deployment `357b30b4-792c-4889-aba1-1b51c570afce` is Online/ACTIVE. No real-device or App Store proof yet. This is test staging (`NODE_ENV=production`, `BLUMI_DEPLOY_ENV=staging`) in an existing Railway environment named `production`; its label does not mean the app is ready for public release.

- Existing Supabase project `nkqcbxufbhfibrgvajim` was confirmed as the user's test database. A fresh public-schema custom archive was created at `/Users/evrenevren/BlumiReleaseBackups/supabase-public-pre-062-064-2026-09-27.dump` (owner-only access) and restored into a disposable local PostgreSQL 17 instance: 62 prior migrations and 17 accounts present. Missing migrations 062/063/064 were then tested on that restored copy and applied to the existing test project; the other 62 were skipped. This is a local public-schema backup, not a managed Supabase PITR backup.
- Railway variable readback and local `resolveServerConfig` passed with Expo Push, Firebase service account, PostgreSQL/OTP, admin signing key, payments off and voice off. Production-mode server config remains fail-closed; test staging omits unverified Apple/Android app-link identities, so no fake association files are served.
- The installed mobile development configuration still points to LAN API/WS addresses. A healthy public server alone does not make that build work off Wi-Fi. Client endpoint setup and a real-device flow remain OPEN.
- This active version came from a 6.3 MB server-only CLI upload; the full-repository CLI archive hit HTTP 413. GitHub source remains connected to `main`. The matching source patch is being placed on `main`; verify the automatic GitHub redeploy remains healthy. No source asset was deleted to shrink the upload.
- `BLUMI_PAYMENTS_ENABLED=0` rejects RevenueCat verification/webhooks; `BLUMI_VOICE_ENABLED=0` retains text-only rooms. Neither integration was removed. Expo project `@erenaksu/blumi` (`bc61197e-e1cb-478b-9f1d-61d8582d77c8`) is linked, enhanced push security is on, and the push token is in Railway. APNs/FCM and actual phone delivery remain OPEN. No paid plan or build was started.
- Existing Firebase project `blumi-mobile-eren` was already on Blaze. No plan upgrade or SMS test was performed; zero ongoing SMS cost is not established. RevenueCat, LiveKit, real app-link identities, native flows and legal/store gates remain OPEN.
- Firebase identity created after user approval: `blumi-railway-auth@blumi-mobile-eren.iam.gserviceaccount.com`, with custom role `projects/blumi-mobile-eren/roles/blumiAuthRuntime` containing only `firebaseauth.users.get` and `firebaseauth.users.delete`. Google Cloud confirmed the role assignment; propagation and authenticated runtime proof remain OPEN. No existing users were deleted and the broad Firebase Admin SDK service-agent identity was not reused.
- User completed Firebase private-key creation. The downloaded JSON was checked for the dedicated account/project and transferred to Railway `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` using stdin; readback equality passed without printing values. A local Admin SDK lookup of a random nonexistent UID returned `auth/user-not-found`, verifying credential/user-read access without reading real users. Account deletion and real-device login were not exercised. The downloaded source remains in Downloads; do not share or commit it.

## Paneli aç

Repo ana klasöründe Node 22.22.2 seçiliyken `npm run ops:center` çalıştır. Terminalin yazdığı `http://127.0.0.1:...` adresini aç; panel yalnızca bu bilgisayarda erişilebilir. Kapatmak için terminalde `Ctrl+C` kullan. Her panel isteğinde yerel Git dalı/değişiklik sayısı yeniden hesaplanır; ürün ve dış sağlayıcı durumları bu dosyanın tarihli anlık görüntüsüdür, Railway, Supabase veya başka hesaplardan canlı veri çekilmez.

## At a glance

| Category | Area | Status | What that means | Owner | Next action | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Ürün | Uygulama ve kod | Sürüyor | Değişiklikler henüz sabitlenmiş bir yayın adayı değil; mevcut işleri korumalıyız. | Birlikte | Yayına girecek dosyaları inceleyip kapsamı sabitle. | `main`; dosya sayısı panel isteğinde yerel Git çalışma ağacından hesaplanır. |
| Yayın | Otomatik kod kontrolleri | Geçti (yalnız kod) | `npm run verify` geçti; bu, iPhone’da veya dış servislerde çalıştığını kanıtlamaz. | Codex | Yayın kapsamı sabitlenince aynı kontrolü tekrar çalıştır. | Node 22.22.2; 2026-09-27 tam `npm run verify` çıkış 0; Operasyon Merkezi 3/3; Expo Doctor 21/21. |
| Yayın | iOS paketi ve aday görseller | Engelli | Paket aday görseller içeriyor; onay kayıtları tamamlanmamış ve yayın ayarı artık güvenli biçimde duruyor. | Codex + sen | Görselleri tek tek inceleyelim; yalnız gereken onaylardan sonra aday yollarını kaldıralım. | Expo paketi: 4.284 modül, 1.081 görsel, 55 MB; yayın kilidi testleri 34/34. |
| Altyapı | Veritabanı / Supabase | Engelli | Bağlı yerel veritabanının hangi ortama ait olduğu bilinmiyor; sınıflandırma ve yedek olmadan değişiklik yapılmaz. | Birlikte | Gizli bilgileri paylaşmadan ortamı belirle; ayrı test veritabanı ve geri yükleme kanıtı hazırla. | Son salt-okunur kayıt: 2026-09-27’de 17 hesap ve 63 geçişin 61’i; işlemden önce güvenle yeniden kontrol et. |
| Altyapı | Sunucu / Railway | Açık | Sunucu ayar dosyaları var; Railway projesi, ortamları, alan adı ve çalışan servis doğrulanmadı. | Birlikte | Yayın kapsamı sabitlenince ayrı test ortamı açıp `/health` ve `/ready` kontrollerini doğrula. | `.railway/railway.ts`; dış hesap durumu doğrulanmadı. |
| Yayın | Apple hesabı / EAS / TestFlight | Senden bekliyor | Apple üyeliğinin onayı bekleniyordu; EAS proje bağlantısı ve iPhone/TestFlight kanıtı yok. | Sen + Codex | Apple onay e-postası gelince “onaylandı” yaz; EAS önizlemesini birlikte hazırlayalım. | `apps/mobile/app.json` içinde EAS proje kimliği yok; hesap durumu son bildirimine dayanıyor. |
| Kimlik | Telefon doğrulama ve SMS | Açık | Uygulamada Firebase telefon doğrulama akışı var; gerçek telefonda deneme ve SMS maliyet sınırı açık. | Birlikte | Ayrı test ortamında gerçek telefonda dene ve servis maliyet sınırlarını kontrol et. | `firebasePhoneAuth.ts`; gerçek cihaz kanıtı yok. |
| Yayın | Push bildirimleri | Açık | Apple/Google bildirim anahtarları ve telefona gerçek bildirim ulaşması doğrulanmadı. | Birlikte | EAS bağlandıktan sonra anahtarları ayarla ve iki telefonda dene. | İki cihazda teslim kanıtı yok. |
| Ürün | Sesli odalar | Açık | Ses isteğe bağlı olmalı ve kapalı başlamalı; davet, yeniden bağlanma ve iki telefon testi açık. | Birlikte | Test ortamında iki hesapla baştan sona dene. | Ürün kuralı kayıtlı; native/cihaz kanıtı yok. |
| Yayın | Ödeme ve mağaza ayarları | Açık | RevenueCat bağlantısı, test ürünleri, ödeme iadesi/geri yükleme ve hesap ayrımı doğrulanmadı. | Birlikte | Gerçek paradan ayrı test ürünleri kurup satın alma/geri yükleme akışlarını dene. | Kod testleri ayar zorunluluklarını denetliyor; sağlayıcı hesabını doğrulamıyor. |
| Güvenlik | Hukukî metinler ve mağaza sayfası | Açık | Gizlilik/şartlar metinleri yayına hazır değil; destek bilgisi ve son insan incelemesi de eksik. | Sen + Codex | Son metinleri onaylayıp güvenli web adreslerinde yayımla. | Yasal yayın kontrolü bu checkout’ta hazır değil. |
| Güvenlik | Admin ve kullanıcı desteği | Henüz yok | Rapor ve hesap kurtarma API’leri var; admin web paneli ve kullanıcı limitlerini yönetme ekranı yok. Bu panel yalnızca okur. | Codex + sen | Kontrol ekranı öncesi ayrı admin kimliği, sınırlı yetki ve işlem kaydını belirle. | `adminRoutes.ts`; web admin ekranı yok. |
| Güvenlik | Gizlilik ve güvenlik incelemesi | Açık | Otomatik kod kontrolleri var; yayın öncesi tüm veri ve erişimlerin insan incelemesi kaydedilmemiş. | Birlikte | Veri sınırları, kayıtlar, yetkiler, saklama süresi ve olay yönetimini gözden geçir. | `npm run verify` kod kanıtıdır; bağımsız inceleme yok. |
| Operasyon | Kesintisiz izleme ve harcama | Açık | Servis kesintisi, SMS/sağlayıcı harcaması ve uyarı gönderimi bu panele bağlı değil. | Birlikte | Hesaplar bağlanınca düşük maliyetli sağlık ve bütçe uyarıları ekle. | Dış izleme veya harcama uyarısı kanıtı yok. |
| Operasyon | Yedek, geri dönüş ve olay planı | Açık | Canlı veritabanı yedeğini geri yükleme, önceki sürüme dönme ve olay eskalasyonu denenmedi. | Birlikte | Herkese açmadan önce yedek geri yükleme ve sürüm geri alma provası yap. | Yerel uygulama yedeği, Supabase’in tam yönetilen yedeği değildir. |
| Mobil | Uygulamayı mağazasız güncelleme | Kurulmadı (acil değil) | EAS Update yok; şimdilik mobil değişiklikte yeni iPhone paketi gerekir. | Codex | İlk sürüm kararlı olana kadar ertele. | Mevcut mobil yapılandırmada EAS Update bulunmuyor. |

## Work in the right order

### 1. Protect environments and the current data

**Status: BLOCKED · Owners: User + Codex**

- Establish what the currently connected database is for without pasting credentials into chat.
- Create distinct test/staging and production database identities. Never use the unidentified database as a migration target.
- Before production schema work: managed backup, restore proof, staging migration, idempotent rerun, and readiness check.
- The release guide's last database snapshot recorded 17 accounts and 61/63 migrations, with migrations 062/063 not applied to that protected database. Treat this as dated evidence and recheck only after the environment is safely classified.

### 2. Make local verification reproducible

**Status: TECHNICAL PASS · RELEASE SCOPE OPEN · Owners: User + Codex**

- `npm run verify` passed on the current checkout under the repo-pinned Node 22.22.2 on 2026-09-27. The active login shell still defaults to Node 20.20.1; use `nvm use 22.22.2` in each development terminal.
- The Operations Center recomputes local Git change counts on each page request without exposing filenames. Automated checks do not identify which changes are approved for release; review and freeze that scope before creating a release candidate.
- A fresh Expo iOS export completed (4,284 modules; 1,081 assets; 55 MB export), but included candidate onboarding artwork. This is a JavaScript/assets bundle check only; native compilation, Simulator, device, and TestFlight remain unverified. The release config now blocks preview/production while candidate asset imports exist.
- Preserve user work. Do not clean, reset, commit, push, or publish these changes as part of this audit.

### 3. Bring up a safe staging service

**Status: OPEN · Owners: User + Codex**

- Link Railway to the repository and configure isolated `staging` and `production` environments.
- Add secrets only in Railway's secret-variable UI. Review each infrastructure plan before applying it.
- Deploy staging first; prove `/health`, `/ready`, API auth, database readiness, and rollback identity. Verify Railway actually waits for GitHub CI before autodeploy.
- Do not point staging and production at the same database or payment webhook.

### 4. Unlock iOS distribution

**Status: WAITING ON USER · Owner: User (account), Codex (setup guidance)**

- Check the Apple Developer enrollment email/status. Last known from the user: still in approval.
- Once approved, link the EAS project and configure preview/production API URLs and public SDK keys in their proper EAS environments.
- Configure signing/APNs, make a preview build, install it on a real iPhone, and verify login, push, and core flows before TestFlight.
- Keep Android internal testing as a separate follow-up unless the user chooses a simultaneous launch.

### 5. Verify real providers and store rules

**Status: OPEN · Owners: User + Codex**

- Phone authentication: test real-device verification and account recovery; monitor provider usage/cost.
- Push: APNs/FCM credentials and real token delivery on two devices.
- Voice: LiveKit staging, invitations, reconnect, local/remote voice, and default muted/off on two accounts.
- Payments: RevenueCat sandbox products/webhook, duplicates, restore/refund, and cross-account protections; never mix sandbox with production.
- Legal/store: align hosted privacy/terms pages, app metadata, support contact, age/safety disclosures, and review notes. Human/legal approval is not inferred from passing tests.

### 6. Prepare human operations before inviting the public

**Status: OPEN · Owner: Joint**

- Define who can review/resolve user reports and recover accounts, and how incidents are escalated.
- Current backend admin access is token-based and narrowly scoped; it is not a login system or web console. Keep operator identity separate from Eren's normal app account.
- The Operations Center is read-only and owner-private. Any future control panel must use separate operator authentication, least privilege, and audit records; never expose admin secrets to the mobile app.
- Add external uptime checks, cost alerts, backup/restore verification, and a rollback drill. Railway's deployment healthcheck alone is not continuous uptime monitoring.

## Existing automation

- **Already in the repository:** GitHub Actions `Verify` runs the full `npm run verify` workflow on pull requests and pushes to `main`.
- **Prepared, not externally verified:** Railway IaC describes CI-gated deployment and a `/ready` health check; confirm those settings after the Railway project is linked.
- **Founder monitoring:** the Codex 15-minute check-in was canceled at the user's request on 2026-09-27. The local panel does not run in the background, send alerts, or read provider telemetry; no recurring monitoring is active.
- **Not yet configured:** external uptime monitoring, spend alerts, staged EAS build/test/release jobs, and mobile OTA updates.

## Immediate next action

**Immediate next user action:** Tell Codex which Blumi build is currently installed on the iPhone (development build or TestFlight) so the app can be pointed at the new HTTPS/WSS test endpoint without making an unapproved store build. A real phone login, match, chat, text-room and push test remain OPEN. Never send passwords or API keys in chat.

## Status meanings

- **Implemented:** present in this checkout.
- **Tested:** named automated checks passed on the stated checkout/runtime.
- **Native verified:** inspected in the actual iOS/Android build or device flow.
- **External verified:** provider account, deployment, or service was checked directly.
- **Waiting on user:** needs the user's account action, decision, or approval.
- **Open / Blocked:** evidence is missing or a prerequisite failed. These do not count as launch-ready.
