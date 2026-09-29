# Blumi launch control

**Current verdict: not ready for public release.** The Operations Center is a read-only view of this evidence snapshot, not live provider telemetry or a production admin console. External systems remain unverified until connected. Follow the [reusable release-captain workflow](./RELEASE_CAPTAIN_WORKFLOW.md); detailed infrastructure steps and evidence live in [`railway-supabase-launch.md`](./railway-supabase-launch.md).

Snapshot: 2026-09-28, with individual rows updated on 2026-09-30 (each row states its own date). Recheck volatile statuses before acting. The status table and ordered checklist below this infrastructure update are historical release-planning items, not live provider telemetry.

**Database release gate (2026-09-28): BLOCKED.** The existing Supabase test project now contains 18 accounts, not the previously recorded 17. Its 65 applied migration checksums match source, but new integrity migration 066 is not live. A local owner-only `public`-schema archive was restored and upgraded in an isolated PostgreSQL 17 instance; offsite S3 backup, independent staging, cleanup, live migration, measured load and recovery drill remain OPEN. See [database release runbook](./DATABASE_RELEASE_RUNBOOK.md). The newly observed 18th account must be classified as disposable or preserved before any cleanup decision.

## Infrastructure setup update — 2026-09-28

This update supersedes the older infrastructure/account snapshot below, not its release gates.

### Latest decision — test deployment with payments and voice deferred

**Test server status, 2026-09-28:** [Railway HTTPS test endpoint](https://blumi-app-production.up.railway.app) is active. External `/health` and `/ready` returned HTTP 200; unauthenticated `/v1/users/me`, `/v1/admin/session` and `/v1/economy/balance` returned HTTP 401. The GitHub-triggered deployment `85a8c5ee-120d-4a27-8a49-789b8b710da9` from `main` reached SUCCESS and `/ready` returned 200 afterward. No real-device or App Store proof yet. This is test staging (`NODE_ENV=production`, `BLUMI_DEPLOY_ENV=staging`) in an existing Railway environment named `production`; its label does not mean the app is ready for public release.

- Existing Supabase project `nkqcbxufbhfibrgvajim` was confirmed as the user's test database. A fresh public-schema custom archive was created at `/Users/evrenevren/BlumiReleaseBackups/supabase-public-pre-062-064-2026-09-27.dump` (owner-only access) and restored into a disposable local PostgreSQL 17 instance: 62 prior migrations and 17 accounts present. Missing migrations 062/063/064 were then tested on that restored copy and applied to the existing test project; the other 62 were skipped. This is a local public-schema backup, not a managed Supabase PITR backup.
- Railway variable readback and local `resolveServerConfig` passed with Expo Push, Firebase service account, PostgreSQL/OTP, admin signing key, payments off and voice off. Production-mode server config remains fail-closed; test staging omits unverified Apple/Android app-link identities, so no fake association files are served.
- The installed mobile development configuration still points to LAN API/WS addresses. A healthy public server alone does not make that build work off Wi-Fi. A separate `server-test` EAS internal-distribution profile is configured with the test HTTPS/WSS origin, demo sessions off, and Firebase app verification on. It is intended only for the owner's test device, not a preview/production release candidate; their candidate-asset and legal gates remain intact. No `.ipa` or phone installation has been verified.
- The active version was originally brought up from a 6.3 MB server-only CLI upload after the full-repository CLI archive hit HTTP 413. GitHub source is connected to `main`; its automatic redeploy from commit `97962367` succeeded. No source asset was deleted to shrink the upload.
- The `server-test` profile passed 35 release-config tests, mobile typecheck and lint. An iOS JavaScript export completed (4,441 modules, 58 MB) and contained the intended HTTPS/WSS test endpoints. It also bundled existing candidate artwork, so this remains owner-only internal test material and is not eligible for preview, TestFlight, or public release. The temporary export was removed after verification; no `.ipa` exists yet.
- Expo `@erenaksu` was on Free with 0/30 monthly builds shown on 2026-09-28. Expo showed no registered Apple device, and `eas device:list` found no Apple team on that account. The iPhone was offline to Xcode and local free disk space was about 6–7 GiB. An internal iOS build therefore still needs Apple team sign-in and device registration; no paid plan, cloud build, or TestFlight submission was started.
- `BLUMI_PAYMENTS_ENABLED=0` rejects RevenueCat verification/webhooks; `BLUMI_VOICE_ENABLED=0` retains text-only rooms. Neither integration was removed. Expo project `@erenaksu/blumi` (`bc61197e-e1cb-478b-9f1d-61d8582d77c8`) is linked, enhanced push security is on, and the push token is in Railway. APNs/FCM and actual phone delivery remain OPEN. No paid plan or build was started.
- Existing Firebase project `blumi-mobile-eren` was already on Blaze. No plan upgrade or SMS test was performed; zero ongoing SMS cost is not established. RevenueCat, LiveKit, real app-link identities, native flows and legal/store gates remain OPEN.
- Firebase identity created after user approval: `blumi-railway-auth@blumi-mobile-eren.iam.gserviceaccount.com`, with custom role `projects/blumi-mobile-eren/roles/blumiAuthRuntime` containing only `firebaseauth.users.get` and `firebaseauth.users.delete`. Google Cloud confirmed the role assignment; propagation and authenticated runtime proof remain OPEN. No existing users were deleted and the broad Firebase Admin SDK service-agent identity was not reused.
- User completed Firebase private-key creation. The downloaded JSON was checked for the dedicated account/project and transferred to Railway `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` using stdin; readback equality passed without printing values. A local Admin SDK lookup of a random nonexistent UID returned `auth/user-not-found`, verifying credential/user-read access without reading real users. Account deletion and real-device login were not exercised. The downloaded source remains in Downloads; do not share or commit it.

### Realtime connection lease rollout gate — BLOCKED (mixed-version P1)

This is a serialized deployment/rollback gate, **not something migration 067 or the application lock code guarantees by itself**. Migration `067_realtime_connection_leases.sql` is additive and must apply successfully to the target database before any lease-aware binary starts. Then stop the old realtime version from admitting sockets and drain/close every old-version WebSocket and instance. Only after no old realtime instance or old socket remains may the lease-aware version begin admission. There must be no old/new realtime instance or socket overlap.

Railway's actual deployment, admission, and socket-drain behavior has not been verified; do not infer that its deployment strategy enforces this order. Before rollout, document and verify how the chosen deployment plan performs each step. **If it cannot guarantee and verify the migration-first, old-socket-drained-before-new-admission sequence, STOP: do not deploy the lease-aware binary.** For rollback, first stop new-version admission and drain/close every lease-aware socket; only then may the old binary return. Do not roll back the binary while lease-aware sockets remain connected.

### Legal and App Store gate — 2026-09-28

**BLOCKED, not waived.** The owner chose a lower-cost first-release scope (mutual match, text chat, optional chat-initiated room with durable text; live voice and paid coin sales deferred). The local mobile flags, visible purchase panel and draft legal copy were aligned with that choice, while the server test environment has payments and voice disabled. This is not proof that the signed release binary and future production server match; inspect those exact artifacts before making store or privacy declarations.

The [iOS App Store submission gate](./APP_STORE_SUBMISSION_GATE.md) records each required proof against Apple's current rules. **2026-09-28 source-only privacy/UGC update:** profile creation and updates now force legacy coordinate columns to NULL; PostgreSQL hydration and account export no longer read or return them. A read-only count against the confirmed test/staging Supabase database found **0 accounts with either coordinate populated**; no data was changed. Production database identity is not confirmed, so production count/cleanup remain OPEN. The last documented backup/restore evidence predates this check; no fresh backup was created. Profile text and canonical chat writes are server-filtered; REST and WebSocket chat routes converge on that same service, and regression tests cover punctuation/zero-width evasion. This remains a narrow phrase filter, not comprehensive moderation.

**Report operations implemented in source:** `/admin` now has a scope-protected report queue (`reports:read` / `reports:resolve`), and `GET /v1/safety/reports` returns only the caller's report status and generic response. The mobile Settings screen has “Bildirimlerim / My reports”. The proposed 4-hour queue check and 4/12/24-hour response targets are internal operating goals only; this is not an automated monitor or proof of a staffed, timely production response. Human coverage, real two-account behavior, a reachable public support channel, adversarial moderation review, and native verification remain OPEN. Apple Guideline 1.2 requires timely action but does not set these Blumi targets. Reviewer access is also OPEN because production disables demo sessions and sign-in uses phone OTP. The mobile first-release flags keep paid coins and voice off, hide coin-pack purchases, and make RevenueCat keys optional; live voice is hard-disabled in mobile runtime and server configuration. A source config plugin removes microphone/camera usage declarations and Android recording/audio-settings/camera permissions from freshly generated native projects. The signed archive and merged-permission checks remain OPEN. An ignored, locally generated `apps/mobile/ios/Blumi/PrivacyInfo.xcprivacy` exists with an empty collected-data array, but no manifest is tracked in source and a clean signed archive has not been inspected; LiveKit source/dependencies are dormant, not removed.

Two additional Apple policy risks are now explicit: Guideline 5.1.1(ix) may require a genuine organization/legal entity if Blumi's gender and matching-preference fields count as sensitive user information; Guideline 1.2 may scrutinize any “anonymous-first” presentation even though Blumi's intended conversation path requires deliberate reciprocal matching. These are **unresolved classifications**, not confirmed violations. Do not register a company or describe the product as random/anonymous chat based on a guess; ask Apple about Blumi's exact data model and mutual-match flow first. Also, Xcode 27.0 is installed locally, but no signed archive proves the required Xcode 26+/iOS 26 SDK, app privacy report, SDK manifests/signatures, or final permission set.

Final checkout verification on 2026-09-28: `npm run verify` passed after the release checklist refresh, including source hygiene, Operations Center alignment, workspace typechecks, mobile/server tests, isolated PostgreSQL gate, dependency audit and Expo Doctor 21/21. This is code evidence only. A later external check confirmed `www.agentsworkerplus.online` resolves to Railway, has valid TLS, and returns 200 for `/health` and `/ready`; all legal routes still return 404 on the deployed build. The apex host without `www` remains on GoDaddy hosting. The legal-enabled route and bilingual copy are local changes, not deployed; production legal preflight remains closed.

- `apps/mobile/src/features/legal/legalPolicyMetadata.ts` now names the confirmed individual operator, Türkiye, the owner-selected public Hotmail contact, and Blumi page paths under `www.agentsworkerplus.online`. Version `2026.09.28-r3` distinguishes the text-only first-release terms/community copy from `r2`; the earlier `2026.09.28` and previously accepted `2026.08.31` remain historical. The in-app English/Turkish copy no longer invents a Canadian postal address; it states the operating country and electronic contact. This is an implemented draft, **not** published or attorney-approved legal copy. The owner confirmed on 2026-09-28 that the inbox received a message; response handling has not been independently proven.
- The owner confirmed that `blumi.io` will not be used for Blumi's legal pages. Its previously configured privacy/support paths rendered 404 on 2026-09-28. Railway now serves `www.agentsworkerplus.online` over valid HTTPS after adding the requested CNAME and `_railway-verify.www` TXT record in GoDaddy. The deployed legal URLs still return 404. The apex host without `www` remains on GoDaddy hosting; source legal URLs now use the working `www` hostname. Do not treat the host's TLS success as publication proof.
- Before publication: make the selected host serve the required HTTPS pages, verify rendered English/Turkish text and links in a browser, establish that the confirmed receiving inbox can also answer a message, and get human legal review of the privacy notice, terms, community/safety rules, deletion instructions, data retention and cross-border disclosures. Compare hosted copy with the final app and actual enabled providers, then change `LEGAL_HOSTED_COPY_ALIGNMENT` only after evidence is recorded. No contract can guarantee zero liability; an attorney's review reduces risk but does not remove it.
- App Store Connect metadata remains **OPEN**: privacy-policy URL; accurate App Privacy answers based on the final binary, SDKs and server flows; truthful age-rating questionnaire for an 18+ social app with user-generated content; support URL and reachable reviewer contact; screenshots from the approved native build; and App Review notes explaining phone sign-in, demo/reviewer access, user reports, blocking, account deletion, and which features are disabled. No screenshots, age rating, App Privacy declaration, or review notes have been submitted or verified in App Store Connect.
- Apple Developer membership is reportedly still awaiting approval. `eas device:create` failed with “no team associated with your Apple account”; do not repeat signing/build-registration as if that prerequisite had passed. No signed `.ipa`, TestFlight build, real-iPhone acceptance, or public submission exists.
- The owner initially preferred not to display their personal name but then explicitly chose individual publication with the legal name visible. Apple states an individual enrollee's legal name appears as the App Store seller name. This resolves the name-visibility choice, not the hosted-page, support, legal review, membership, or native gates. Focused legal tests 16/16, session tests 265/265, mobile typecheck and lint passed after the metadata change; no native or external legal proof was obtained.
- A local server page generator renders the in-app Turkish/English privacy, terms and community copy plus support and deletion instructions at the selected `/blumi/` paths. Public routes are fail-closed by default; route tests exist. Enablement requires human legal/product approval and a deployment with the legal-pages flag enabled. This checkout has not been pushed or deployed. The `www` host returns 200 for health/readiness but 404 for legal routes on the currently deployed build. [App Privacy working draft](./APP_STORE_PRIVACY_DRAFT.md) maps current code to possible Apple categories with unresolved SDK, historical production location, sensitive-data, purchase and audio classifications. Do not submit these candidate answers as final.
- `www.agentsworkerplus.online` is the connected Railway host; the public DNS CNAME and Railway TXT ownership record are visible. The root/apex hostname remains served by GoDaddy and is not used by the legal-page URLs. No Railway deploy or GoDaddy apex forwarding change was made.

## Paneli aç

Repo ana klasöründe Node 22.22.2 seçiliyken `npm run ops:center` çalıştır. Terminalin yazdığı `http://127.0.0.1:...` adresini aç; panel yalnızca bu bilgisayarda erişilebilir. Kapatmak için terminalde `Ctrl+C` kullan. Her panel isteğinde yerel Git dalı/değişiklik sayısı yeniden hesaplanır; ürün ve dış sağlayıcı durumları bu dosyanın tarihli anlık görüntüsüdür, Railway, Supabase veya başka hesaplardan canlı veri çekilmez.

## At a glance

| Category | Area | Status | What that means | Owner | Next action | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Ürün | İlk sürüm kapsamı | Uygulandı (native açık) | Eşleşme, metin sohbeti ve davetle metin odası hedefleniyor; canlı ses ve ücretli jetonlar ilk sürümde kapalı. | Codex | Tam native yapılandırmayı ve imzalı adayı doğrula. | Mobil release flag’leri ve hukuki taslak güncel checkout’ta; imzalı uygulama yok. |
| Yayın | Yerel kod kontrolleri | Geçti (yalnız kod) | Kaynak kontrolleri geçti; gerçek iPhone/Simulator, imza ve dış servis kanıtı değildir. | Codex | Aday görsel kapısı açıldıktan sonra native akışları doğrula. | 2026-09-28 full `npm run verify` exit 0; Expo Doctor 21/21. Installed Simulator app did not load this checkout's Metro bundle, so changed-screen native proof remains OPEN. |
| Yayın | Git yayın adayı | Açık | Güncel çalışma entegrasyon dalı `claude/busy-cray-dl5wvr` üzerinde (main'e alınmadı); çalışma ağacı henüz gözden geçirilmiş sabit yayın adayı değil. Son `npm run verify` 2026-09-30'da geçti. | Birlikte | Değişen dosyaları ve release kapsamını gözden geçir. | 2026-09-28 gözlemi (2026-09-30 itibarıyla geçersiz, yukarıdaki dal durumu güncel): o gün checkout `main` dalında `167a566c` idi, `origin/main` ile aynı commit; performans düzeltmeleri ve `.build/` çalışma ağacında. Canlı deploy commit'i ayrıca doğrulanmadı. |
| Yayın | iOS paketi ve aday görseller | Native açık | 2026-09-30: kullanıcı onayıyla 29 aday onboarding/profil görseli `*-runtime` yollarına taşındı (baytlar aynı); aday import sayısı 0, yayın kilidi değişmeden geçiyor. | Sen + Codex | Dört onboarding/profil ekranını iPhone'da doğrula; imzalı `.ipa` hâlâ yok. | `ENGINEERING_AUDIT_2026-09-30.md` F-09; entegrasyon dalı `claude/busy-cray-dl5wvr`, main'e alınmadı. |
| Altyapı | Test sunucusu / Railway | Testte çalışıyor | Railway servisi test staging olarak ayakta; panel ortam adının `production` olması bunu gerçek prod yapmaz. | Codex | Ayrı gerçek production ortamı/DB kararı ve maliyet sınırını netleştir. | 2026-09-28 yeniden kontrol: Railway `www` custom domain Online; `/health` 200, `/ready` 200. |
| Yayın | Realtime lease mixed-version rollout | BLOCKED | Migration 067 hedef DB'de başarıyla uygulanmadan lease-aware binary açılmaz; eski/yeni realtime instance veya socket overlap kabul edilmez. Railway sıralama/drain davranışı doğrulanmadı. | Codex + deploy operator | Gerçek deploy/drain/rollback adımlarını kanıtla; bu sıra garanti edilemiyorsa STOP. | Migration ve kod tek başına rollout sırasını garanti etmez; eski socket drain edilmeden yeni admission, rollback'te yeni socket drain edilmeden eski binary yok. |
| Altyapı | Veritabanı / Supabase | Test kanıtı var; prod açık | Mevcut Supabase projesi test olarak sınıflandırıldı; yedek kopyada migration denemesi yapıldı. Managed PITR ve production ayrımı kanıtı değildir. | Birlikte | Yayından önce production DB kimliği, yedek ve geri yükleme provasını ayrıca kaydet. | 2026-09-28 staging read-only count: 0 coordinate records; no DB write. 2026-09-27 backup restore proof is the latest; production identity/count remain unknown. |
| Güvenlik | UGC güvenliği ve kullanıcı operasyonu | Kod kısmi / operasyon açık | Sunucu filtresi, rapor/block, admin rapor kuyruğu ve kullanıcının kendi bildirimlerini görmesi kodda var. Bu filtre tam moderasyon değildir; insan triage/yanıt, erişilebilir destek, adversarial kapsam ve cihaz kanıtı yok. | Birlikte | Kuyruğu nasıl nöbetle kontrol edeceğimizi ve gerçek rapor→inceleme→genel yanıt provasını tamamla. | 2026-09-28 source tests; 4 saatte bir kontrol/4-12-24 saat hedefleri Blumi iç hedefleridir, otomasyon veya Apple SLA değildir. |
| Yayın | Apple politika sınıflandırması | Açık / yüksek risk | 5.1.1(ix) bireysel hesapla hassas veri gereksinimini; 1.2 ise anonimliğe/random chat yorumunu etkileyebilir. Kesin Apple görüşü yok. | Birlikte | Üyelik/takım görünür olunca Meet with Apple üzerinden tam model için yazılı yönlendirme iste; şirket masrafı yapma. | `APP_STORE_SUBMISSION_GATE.md` içindeki taslak soru; Apple resmi kuralları ve ayrı forum tecrübeleri. |
| Gizlilik | Hukuk sayfaları ve destek | Engelli | `www.agentsworkerplus.online` Railway’e bağlandı ve HTTPS çalışıyor; hukuk yolları canlı build'de 404. Apex host GoDaddy'de kalıyor. Legal route default-off; destek inbox'ına ileti ulaştığı kullanıcı tarafından doğrulandı, metnin insan incelemesi ve destek yanıt operasyonu açık. | Codex + sen | Metni insan olarak incele; ayrı deploy onayıyla staging build'ini yayınla, legal flag'i aç ve tüm URL'leri dışarıdan doğrula. | 2026-09-28: sahibi inbox teslimini doğruladı; yerel TR/EN sayfa ve uygulama metni eşitlik testi geçti; canlı legal routes 404. |
| Yayın | App Store Connect beyanları | Taslak / açık | Listeleme/gizlilik cevapları taslak; imzalı build’e göre veri türleri, güncel yaş derecesi, DSA statüsü, ihracat uyumu, ekran görüntüleri ve Review Notes girilmedi. | Birlikte | Legacy konum saklamasını çöz; final binary/SDK kanıtından sonra App Store Connect alanlarını tamamla. | `APP_STORE_PRIVACY_DRAFT.md`; yalnız ignored yerel iOS manifesti var, kaynakta izlenen app manifesti ve imzalı arşiv kanıtı yok; Xcode raporu ve dış beyanlar yok. |
| Yayın | Apple hesabı / EAS / TestFlight | Senden bekliyor | Apple hesabında onaylı takım görünmedi; bu yüzden kayıt/imza ve TestFlight kanıtı yok. EAS projesi ise bağlı. | Sen + Codex | Üyelik onaylanınca önce Apple politika randevusu; sonra cihaz/imza adımı. | Son hata: “no team associated”; EAS projesi `@erenaksu/blumi` bağlı. |
| Mobil | Gerçek cihaz ve bildirim | Açık | Server-test paketi/Expo push yapılandırması hazırlanmış; telefon kurulumu, push teslimi, login ve iki hesaplı akış kanıtlanmadı. | Birlikte | Uygun native adayla iki hesaplı cihaz provasını yap. | `.ipa` yok; APNs/FCM gerçek teslimi yok. |
| Operasyon | Admin ve izleme paneli | Kısmi: yeni kod yerelde | Canlı `/admin` hâlâ eski kullanıcı yönetimi ekranı. Genel Bakış/İş Analizi, metrik API'si ve rapor kuyruğu güncellemeleri yerel çalışma ağacında; `main`e push edilmedi. Online ve rapor verisi 60 sn'de; ağır iş analizi 5 dk önbellekle yenilenmek üzere kodlandı. Sağlayıcı maliyeti, uptime alarmı ve bazı ürün metrikleri ölçülmüyor. | Codex | Admin/legal kaynak paketini gözden geçir; onay sonrası ayrı staging yayın adımı yap. | 2026-09-28: canlı `/admin` eski HTML; canlı `/v1/admin/analytics` 404; local server suite 518 passed / 23 skipped; ayrıca isolated PostgreSQL analytics 1/1 passed (6 ms sentetik snapshot); local changes unpushed. |
| Operasyon | Kesintisiz izleme ve harcama | Kurulu değil | Dört saatlik rapor kuyruğu kontrolü insan operasyon hedefidir; uptime, hata oranı, SMS harcaması veya bütçe için otomatik alarm değildir. | Birlikte | Gerekirse ücret ve erişim sınırları belli, ayrı onaylı bir alarm/monitoring düzeni seç. | Bu turda yeni automation, harici monitor veya ücretli servis kurulmadı. |
| Operasyon | Disk alanı | Temizlendi | Derleme/paket önbellekleri temizlendi; kaynak kodu, indirmeler, yedekler ve Simülatör kullanıcı verileri korunup değişmedi. | Codex | Native derleme başlamadan boş alanı tekrar ölç. | 2026-09-28 `df -h /`: 9.6 GiB boş (yaklaşık 10.3 GB). |

## Work in the right order

### 1. Protect environments and the current data

**Status: BLOCKED · Owners: User + Codex**

- Establish what the currently connected database is for without pasting credentials into chat.
- Create distinct test/staging and production database identities. Never use the unidentified database as a migration target.
- Before production schema work: managed backup, restore proof, staging migration, idempotent rerun, and readiness check.
- The release guide's 2026-09-27 database snapshot recorded 17 accounts and 61/63 migrations, with migrations 062/063 not applied to that protected database (superseded 2026-09-28: 18 accounts, 65 applied migrations, 066 not live; see the database gate above and the [runbook](./DATABASE_RELEASE_RUNBOOK.md)). Treat this as dated evidence and recheck only after the environment is safely classified.

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
- For any lease-aware server rollout, apply migration `067_realtime_connection_leases.sql` successfully first; stop old realtime admission and drain all old-version instances/sockets before enabling new-version admission. Do not use a mixed rolling cutover. Rollback in reverse order: stop new admission, drain all lease-aware sockets, then restore the old binary. Verify the actual Railway sequence; if it cannot guarantee these steps, **STOP the deployment**.
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

**Immediate next user action:** Keep waiting for Apple Developer membership approval; once the team is visible, request a Meet with Apple App Review appointment and ask the exact 5.1.1(ix)/1.2 questions in [`APP_STORE_SUBMISSION_GATE.md`](./APP_STORE_SUBMISSION_GATE.md). Do **not** pay to form a company, submit a build, or describe Blumi as random/anonymous chat until this risk is clarified. The legal host, signing/TestFlight, privacy declarations and native proof remain separate open gates.

## Status meanings

- **Implemented:** present in this checkout.
- **Tested:** named automated checks passed on the stated checkout/runtime.
- **Native verified:** inspected in the actual iOS/Android build or device flow.
- **External verified:** provider account, deployment, or service was checked directly.
- **Waiting on user:** needs the user's account action, decision, or approval.
- **Open / Blocked:** evidence is missing or a prerequisite failed. These do not count as launch-ready.
