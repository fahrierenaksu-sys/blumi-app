# Blumi launch control

**Current verdict: not ready for public release.** The Operations Center is a read-only view of this evidence snapshot, not live provider telemetry or a production admin console. External systems remain unverified until connected. Follow the [reusable release-captain workflow](./RELEASE_CAPTAIN_WORKFLOW.md); detailed infrastructure steps and evidence live in [`railway-supabase-launch.md`](./railway-supabase-launch.md).

Snapshot: 2026-10-02. The At a glance rows were refreshed on 2026-10-02 (each row states its own date). Dated sections below are evidence of what happened then; where a later fact replaced one, it carries a "superseded" note. Recheck volatile statuses before acting.

## Update — 2026-10-02

- **EXTERNAL VERIFIED:** GitHub `main` and `develop` are both at `76a195e`
  (`git ls-remote`). Railway `production` deployment `8909a8ee` from `main` @
  `76a195e` reached SUCCESS at 2026-10-01 23:56 UTC; `/health` and `/ready`
  return 200. The live server therefore includes the chat push/retry/read-sync
  fixes, room movement synchronization and the receipts code (receipts stay off
  until 070). Native and two-phone proof of these remain OPEN; the service
  still runs one replica.
- **EXTERNAL VERIFIED:** Supabase ledger has 69 rows, latest
  `069_moderation_phone_bans.sql` (read-only query). Migration 070 is WRITTEN,
  NOT APPLIED; see the [070 runbook](./MIGRATION_070_RUNBOOK.md).
- **IMPLEMENTED:** `apps/mobile/.eas/workflows/testflight.yml` runs only by
  hand since `8d46d08` (2026-10-01). No push builds or publishes anything.
- **EXTERNAL VERIFIED:** the five hosted legal/support/deletion routes
  (`/blumi/legal/privacy`, `/terms`, `/child-safety`, `/blumi/support`,
  `/blumi/legal/delete-account`) return 200; `LEGAL_HOSTED_COPY_ALIGNMENT` is
  `"aligned"`. Human legal review remains OPEN. `/.well-known/apple-app-site-association`
  still returns 404. The new admin console is live (`/admin` 200, title
  "Blumi · Yönetim merkezi"; `/v1/admin/analytics` 401 without a token).
- **OPEN:** internal TestFlight builds 5, 12, 13 and 14 exist, but none carries
  the room motion client (first in `1a8f273`; build 14 is `9982882`). Two-phone
  live room motion needs a new build.

2026-10-01: local chat push/retry/read-sync fixes are implemented and tested in
`blumison/develop`; see the [backend progress record](../quality/BACKEND_REALTIME_PUSH_PROGRESS_2026-10-01.md).
Room movement synchronization and presence/reconnect are now IMPLEMENTED / TESTED
in the local single-process server and mobile client. Physical-device push delivery
and owner native verification remain OPEN. No deployment
was performed; shared motion state for multiple replicas is unverified.
Delivery/read receipts (✓ / ✓✓ / "görüldü"): IMPLEMENTED / TESTED on a worktree
branch, not merged. Migration 070 is WRITTEN, NOT APPLIED; the binary runs without
it with receipts off ([runbook](./MIGRATION_070_RUNBOOK.md)). Native and two-phone
verification OPEN. (Superseded 2026-10-02: this work is merged to `main` and
deployed; see the update above.)

## TestFlight branch automation — 2026-09-30

### Operations automation expansion — 2026-09-30

- **EXTERNAL VERIFIED:** Codex thread heartbeats are active: build/Apple and
  server checks every 10 minutes, local backup daily at 02:00, isolated restore
  rehearsal Sunday at 03:00 and local Simulator smoke daily at 20:00 (Istanbul).
  Ordinary unchanged/successful runs stay quiet. Local jobs require an available Mac.
- **EXTERNAL VERIFIED:** GitHub Dependabot alerts and security-update PRs are
  enabled for `fahrierenaksu-sys/blumi-app`. Existing pull-request CI verifies
  proposals; dependency PRs are not automatically merged.
- **TESTED:** a new owner-only public-schema archive of the existing Supabase
  test database was taken and restored into a disposable socket-only PG17
  cluster. SHA256 `c6cb8355c8cf8fabe2addf9cf2025279d2908e6fb14ffd9f7dc24e9334603020`,
  250130 bytes, 68 migrations, 0 additional migrations, idempotent rerun,
  0 remaining integrity findings. No live migration was performed.
- **EXTERNAL VERIFIED:** `/health` and `/ready` returned HTTP 200; Apple internal
  group `Blumi QA` was created with automatic distribution, initially 0 testers.
- **IMPLEMENTED / OPEN:** TestFlight workflow now includes processing, internal
  group assignment and test notes; official schema and EAS server validation pass.
  Actual Apple acceptance/distribution and group membership remain open.
- **IMPLEMENTED / OPEN:** `.maestro/demo-smoke.yml` and the dedicated local
  `scripts/automation/native-smoke.mjs` exercise demo entry, match, text chat,
  My Room and Shop. Native execution remains open until a complete successful run.
  EAS rejected cloud Maestro because the account lacks a paid plan; no plan was
  purchased. Local smoke uses only `Blumi Automation QA`, not the owner's device.
- **OPEN:** offsite backups, Supabase auth/storage backup, real OTP, server chat
  persistence and physical-device evidence. These automations do not establish
  public-release readiness.

- **EXTERNAL VERIFIED (later update):** build 5 is `Ready to Test` in `Blumi QA`.
  Only the owner's existing App Store Connect account was invited, following
  explicit confirmation. Build 5's Turkish test notes were saved. Submission
  succeeded when run with production environment variables; the automated
  TestFlight job now explicitly uses the same environment. Changes were pushed
  in integration commit `21df9f7a` after lint, typecheck and workspace tests passed.
- **BLOCKED:** the first local native smoke could not complete: cold Simulator
  and build consumed the available disk space; the generated workspace also
  retained an optional Sentry upload phase without an organization. The runner
  disables Sentry auto-upload only for this isolated demo test, limits build jobs
  and architecture, and now requires 24 GiB free before starting. No complete
  Maestro run or native PASS is claimed. Only this attempt's generated build
  cache and dedicated disposable Simulator were removed; user data was preserved.

- **IMPLEMENTED / TESTED:** `apps/mobile/.eas/workflows/testflight.yml` listens
  for pushes to `main` and supports a manual run (`workflow_dispatch`); the
  branch filter moved from `claude/busy-cray-dl5wvr` to `main` in commit
  `e3959d5` (2026-09-30). Before
  building iOS, source hygiene, package builds, TypeScript, lint, tests and
  dependency audit must pass. Submission uses only that job's exact build ID.
  (Superseded 2026-10-01: since `8d46d08` the workflow is `workflow_dispatch`
  only; pushes to `main` no longer start it.)
- **EXTERNAL VERIFIED:** Expo project `@erenaksu/blumi` is connected to
  `fahrierenaksu-sys/blumi-app` with base directory `/apps/mobile`. The workflow
  passed the official JSON schema and EAS server-side validation. The CLI's
  job-type validation currently crashes on the server's custom-job schema;
  validation was completed directly with the CLI's schema validator and
  authenticated server validation API instead.
- **EXTERNAL VERIFIED:** all five hosted legal/support/deletion routes in both
  languages again returned HTTP 200 and matched generated HTML byte-for-byte.
  The existing legal publication evidence and optional telemetry configuration
  are included as prerequisites for unattended production builds.
- **OPEN:** first automatic signed build, submission and Apple processing.
  Since `e3959d5`, a push to `main` fingerprints the native runtime: a matching
  `production` build receives an OTA update on the `production` channel,
  otherwise a new binary is built and uploaded. The workflow does not
  submit an App Store review or release the app publicly. Build numbers use
  the existing remote auto-increment setting. Future branches need an explicit
  change to the workflow's branch filter. (Superseded 2026-10-01: the run is
  manual only since `8d46d08`; the fingerprint/OTA logic is unchanged.)
- **Next action (agent, 2026-09-30):** push the automation commit and verify its
  automatic workflow run in Expo. (Superseded: pushed in `21df9f7a`; since
  `8d46d08` there is no automatic run to verify.)
- **PAUSED (2026-09-30):** automatic develop OTA updates. Commit `ec16625`
  ("ci: pause automatic develop OTAs until the bundle fits the EAS asset limit")
  removed the `push: develop` trigger from
  `.github/workflows/develop-ota-publish.yml`; it now runs only by manual
  `workflow_dispatch`. The iOS bundle carries about 1220 assets and EAS Update
  accepts at most 1000 per update. The EAS fallback
  `develop-preview-update.yml` is also manual only. Pushes to `develop` publish
  nothing until the asset count drops.

**Database release gate (2026-09-28): BLOCKED.** The existing Supabase test project now contains 18 accounts, not the previously recorded 17. Its 65 applied migration checksums match source, but new integrity migration 066 is not live. A local owner-only `public`-schema archive was restored and upgraded in an isolated PostgreSQL 17 instance; offsite S3 backup, independent staging, cleanup, live migration, measured load and recovery drill remain OPEN. See [database release runbook](./DATABASE_RELEASE_RUNBOOK.md). The newly observed 18th account must be classified as disposable or preserved before any cleanup decision. (Superseded 2026-09-30: the owner classified all 18 accounts as their own test accounts, kept them, and made this database plus Railway `production` the release target; 066–069 are applied. See [`MIGRATION_068_RUNBOOK.md`](./MIGRATION_068_RUNBOOK.md) §1.)

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

(Superseded 2026-09-30: the live deployment `d5f77b8e` of 2026-09-29 already ran lease-aware `2a55475`, which contains `4d016d2`, with 067 applied, so the cutover happened (`MIGRATION_068_RUNBOOK.md` §1). Still open: an overlap of two lease-aware versions was not rehearsed, and any rollback to a pre-lease binary must follow the drain order below.)

This is a serialized deployment/rollback gate, **not something migration 067 or the application lock code guarantees by itself**. Migration `067_realtime_connection_leases.sql` is additive and must apply successfully to the target database before any lease-aware binary starts. Then stop the old realtime version from admitting sockets and drain/close every old-version WebSocket and instance. Only after no old realtime instance or old socket remains may the lease-aware version begin admission. There must be no old/new realtime instance or socket overlap.

Railway's actual deployment, admission, and socket-drain behavior has not been verified; do not infer that its deployment strategy enforces this order. Before rollout, document and verify how the chosen deployment plan performs each step. **If it cannot guarantee and verify the migration-first, old-socket-drained-before-new-admission sequence, STOP: do not deploy the lease-aware binary.** For rollback, first stop new-version admission and drain/close every lease-aware socket; only then may the old binary return. Do not roll back the binary while lease-aware sockets remain connected.

### Legal and App Store gate — 2026-09-28

**BLOCKED, not waived.** The owner chose a lower-cost first-release scope (mutual match, text chat, optional chat-initiated room with durable text; live voice and paid coin sales deferred). The local mobile flags, visible purchase panel and draft legal copy were aligned with that choice, while the server test environment has payments and voice disabled. This is not proof that the signed release binary and future production server match; inspect those exact artifacts before making store or privacy declarations.

The [iOS App Store submission gate](./APP_STORE_SUBMISSION_GATE.md) records each required proof against Apple's current rules. **2026-09-28 source-only privacy/UGC update:** profile creation and updates now force legacy coordinate columns to NULL; PostgreSQL hydration and account export no longer read or return them. A read-only count against the confirmed test/staging Supabase database found **0 accounts with either coordinate populated**; no data was changed. Production database identity is not confirmed, so production count/cleanup remain OPEN. The last documented backup/restore evidence predates this check; no fresh backup was created. Profile text and canonical chat writes are server-filtered; REST and WebSocket chat routes converge on that same service, and regression tests cover punctuation/zero-width evasion. This remains a narrow phrase filter, not comprehensive moderation.

**Report operations implemented in source:** `/admin` now has a scope-protected report queue (`reports:read` / `reports:resolve`), and `GET /v1/safety/reports` returns only the caller's report status and generic response. The mobile Settings screen has “Bildirimlerim / My reports”. The proposed 4-hour queue check and 4/12/24-hour response targets are internal operating goals only; this is not an automated monitor or proof of a staffed, timely production response. Human coverage, real two-account behavior, a reachable public support channel, adversarial moderation review, and native verification remain OPEN. Apple Guideline 1.2 requires timely action but does not set these Blumi targets. Reviewer access is also OPEN because production disables demo sessions and sign-in uses phone OTP. The mobile first-release flags keep paid coins and voice off, hide coin-pack purchases, and make RevenueCat keys optional; live voice is hard-disabled in mobile runtime and server configuration. A source config plugin removes microphone/camera usage declarations and Android recording/audio-settings/camera permissions from freshly generated native projects. The signed archive and merged-permission checks remain OPEN. An ignored, locally generated `apps/mobile/ios/Blumi/PrivacyInfo.xcprivacy` exists with an empty collected-data array, but no manifest is tracked in source and a clean signed archive has not been inspected (disputed later by `APP_STORE_SUBMISSION_GATE.md`; only the signed archive settles it). Updated 2026-09-30: the LiveKit/WebRTC dependencies (`@livekit/react-native`, `@livekit/react-native-webrtc`, `livekit-client`) and `livekitClient.ts` were removed from mobile in commit `f407706`, and `app.config.js` now fails if a camera/audio SDK is present (`scripts/mobile-no-media.cjs`); the signed-archive check remains OPEN.

Two additional Apple policy risks are now explicit: Guideline 5.1.1(ix) may require a genuine organization/legal entity if Blumi's gender and matching-preference fields count as sensitive user information; Guideline 1.2 may scrutinize any “anonymous-first” presentation even though Blumi's intended conversation path requires deliberate reciprocal matching. These are **unresolved classifications**, not confirmed violations. Do not register a company or describe the product as random/anonymous chat based on a guess; ask Apple about Blumi's exact data model and mutual-match flow first. Also, Xcode 27.0 is installed locally, but no signed archive proves the required Xcode 26+/iOS 26 SDK, app privacy report, SDK manifests/signatures, or final permission set.

Final checkout verification on 2026-09-28: `npm run verify` passed after the release checklist refresh, including source hygiene, Operations Center alignment, workspace typechecks, mobile/server tests, isolated PostgreSQL gate, dependency audit and Expo Doctor 21/21. This is code evidence only. A later external check confirmed `www.agentsworkerplus.online` resolves to Railway, has valid TLS, and returns 200 for `/health` and `/ready`; all legal routes still return 404 on the deployed build. The apex host without `www` remains on GoDaddy hosting. The legal-enabled route and bilingual copy are local changes, not deployed; production legal preflight remains closed. (Superseded 2026-09-30: the legal routes are deployed and return 200; see the 2026-10-02 update.)

- `apps/mobile/src/features/legal/legalPolicyMetadata.ts` now names the confirmed individual operator, Türkiye, the owner-selected public Hotmail contact, and Blumi page paths under `www.agentsworkerplus.online`. Version `2026.09.28-r3` distinguishes the text-only first-release terms/community copy from `r2`; the earlier `2026.09.28` and previously accepted `2026.08.31` remain historical. The in-app English/Turkish copy no longer invents a Canadian postal address; it states the operating country and electronic contact. This is an implemented draft, **not** published or attorney-approved legal copy. The owner confirmed on 2026-09-28 that the inbox received a message; response handling has not been independently proven.
- The owner confirmed that `blumi.io` will not be used for Blumi's legal pages. Its previously configured privacy/support paths rendered 404 on 2026-09-28. Railway now serves `www.agentsworkerplus.online` over valid HTTPS after adding the requested CNAME and `_railway-verify.www` TXT record in GoDaddy. The deployed legal URLs still return 404. The apex host without `www` remains on GoDaddy hosting; source legal URLs now use the working `www` hostname. Do not treat the host's TLS success as publication proof. (Superseded 2026-09-30: the `www` legal URLs return 200.)
- Before publication: make the selected host serve the required HTTPS pages, verify rendered English/Turkish text and links in a browser, establish that the confirmed receiving inbox can also answer a message, and get human legal review of the privacy notice, terms, community/safety rules, deletion instructions, data retention and cross-border disclosures. Compare hosted copy with the final app and actual enabled providers, then change `LEGAL_HOSTED_COPY_ALIGNMENT` only after evidence is recorded. No contract can guarantee zero liability; an attorney's review reduces risk but does not remove it. (Superseded 2026-09-30: hosting, byte-for-byte comparison and the `"aligned"` flag are done; human legal review and the inbox reply test remain OPEN.)
- App Store Connect metadata remains **OPEN**: privacy-policy URL; accurate App Privacy answers based on the final binary, SDKs and server flows; truthful age-rating questionnaire for an 18+ social app with user-generated content; support URL and reachable reviewer contact; screenshots from the approved native build; and App Review notes explaining phone sign-in, demo/reviewer access, user reports, blocking, account deletion, and which features are disabled. No screenshots, age rating, App Privacy declaration, or review notes have been submitted or verified in App Store Connect.
- Apple Developer membership is reportedly still awaiting approval. `eas device:create` failed with “no team associated with your Apple account”; do not repeat signing/build-registration as if that prerequisite had passed. No signed `.ipa`, TestFlight build, real-iPhone acceptance, or public submission exists. (Superseded 2026-09-30: membership is active; build 5 reached `Ready to Test` in `Blumi QA`, and builds 12–14 followed. Public submission still has not happened.)
- The owner initially preferred not to display their personal name but then explicitly chose individual publication with the legal name visible. Apple states an individual enrollee's legal name appears as the App Store seller name. This resolves the name-visibility choice, not the hosted-page, support, legal review, membership, or native gates. Focused legal tests 16/16, session tests 265/265, mobile typecheck and lint passed after the metadata change; no native or external legal proof was obtained.
- A local server page generator renders the in-app Turkish/English privacy, terms and community copy plus support and deletion instructions at the selected `/blumi/` paths. Public routes are fail-closed by default; route tests exist. Enablement requires human legal/product approval and a deployment with the legal-pages flag enabled. This checkout has not been pushed or deployed. The `www` host returns 200 for health/readiness but 404 for legal routes on the currently deployed build (superseded 2026-09-30: legal routes return 200). [App Privacy working draft](./APP_STORE_PRIVACY_DRAFT.md) maps current code to possible Apple categories with unresolved SDK, historical production location, sensitive-data, purchase and audio classifications. Do not submit these candidate answers as final.
- `www.agentsworkerplus.online` is the connected Railway host; the public DNS CNAME and Railway TXT ownership record are visible. The root/apex hostname remains served by GoDaddy and is not used by the legal-page URLs. No Railway deploy or GoDaddy apex forwarding change was made.

## Paneli aç

Repo ana klasöründe `.nvmrc` sürümü (22.23.3) seçiliyken `npm run ops:center` çalıştır. Terminalin yazdığı `http://127.0.0.1:...` adresini aç; panel yalnızca bu bilgisayarda erişilebilir. Kapatmak için terminalde `Ctrl+C` kullan. Her panel isteğinde yerel Git dalı/değişiklik sayısı yeniden hesaplanır; ürün ve dış sağlayıcı durumları bu dosyanın tarihli anlık görüntüsüdür, Railway, Supabase veya başka hesaplardan canlı veri çekilmez.

## At a glance

| Category | Area | Status | What that means | Owner | Next action | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Ürün | İlk sürüm kapsamı | Uygulandı (native açık) | Eşleşme, metin sohbeti ve davetle metin odası; canlı ses ve ücretli jetonlar ilk sürümde kapalı (sunucu `BLUMI_VOICE_ENABLED=1`'i reddeder, mobil ses SDK'sı kaldırıldı). | Ajan | Güncel build'de ses ve satın almanın gerçekten kapalı olduğunu ve imzalı arşivi doğrula. | Mobil release flag'leri ve hukuki metin güncel checkout'ta; TestFlight build'leri var, imzalı arşiv incelenmedi. |
| Yayın | Yerel kod kontrolleri | Geçti (yalnız kod) | Kaynak kontrolleri geçti; gerçek iPhone/Simulator, imza ve dış servis kanıtı değildir. | Ajan | Native P0 akışlarını güncel `develop` build'inde doğrula. | Son kayıtlı tam `npm run verify` 2026-09-30'da geçti; `76a195e` için tam koşu kaydı yok. Aday import sayısı 0, release koruması geçiyor. |
| Yayın | Git yayın adayı | Açık | 2026-10-02: GitHub `main` ve `develop` aynı commit'te (`76a195e`); Railway bu commit'ten deploy edildi. Gözden geçirilmiş, dondurulmuş bir yayın adayı (commit + build + deployment + DB) henüz kaydedilmedi. | Birlikte | Native P0 kontrollerinden sonra sabit release adayını kaydet. | `git ls-remote` 2026-10-02; Railway deployment `8909a8ee`. 2026-09-28 ve 2026-09-30 dal gözlemleri geçersiz. |
| Yayın | iOS paketi ve aday görseller | Native açık | 2026-09-30: kullanıcı onayıyla 29 aday onboarding/profil görseli `*-runtime` yollarına taşındı (baytlar aynı); aday import sayısı 0, yayın koruması geçiyor. | Sahip + ajan | Dört onboarding/profil ekranını iPhone'da doğrula; imzalı arşivi incele. | `ENGINEERING_AUDIT_2026-09-30.md` F-09; taşıma commit'i `58d2d04` `main` geçmişinde. |
| Altyapı | Sunucu / Railway | Çalışıyor (release hedefi) | Railway projesinde tek ortam `production`, servis `blumi-app`; sahibin 2026-09-30 kararıyla release hedefi ve production gibi ele alınır. Ayrı staging yok; `.railway/railway.ts` (`blumi-api` + staging) canlıyla uyuşmuyor. Servis `NODE_ENV=production` ve `BLUMI_DEPLOY_ENV=staging` ile çalışıyor (AGENTS.md; AASA 404 ile tutarlı, çünkü production modu app-link kimlikleri olmadan açılmaz): app link yok, satın alma ortamı sandbox. Herkese açık yayından önce `production`'a geçmeli (`APP_STORE_SUBMISSION_GATE.md`). | Sahip + ajan | Dashboard'da `BLUMI_DEPLOY_ENV` değerini teyit et (sır değerlerini okumadan); ayrı staging ortamı/DB kararını ve maliyet sınırını ver; IaC'yi canlıyla eşitle. | 2026-10-02: deployment `8909a8ee` SUCCESS (`main` @ `76a195e`); `/health` 200, `/ready` 200; tek replika. |
| Yayın | Realtime lease mixed-version rollout | Geçiş tamam (2026-09-29) | Lease-aware sunucu 2026-09-29'dan beri canlı ve 067 uygulanmış. İki lease-aware sürümün çakışması prova edilmedi; lease öncesi binary'ye dönüş drain sırasına uymalı. | Ajan + deploy operatörü | Lease öncesi binary'ye rollback gerekirse önce yeni admission'ı durdur, tüm lease-aware socket'leri drain et, sonra eski binary'yi aç. | `MIGRATION_068_RUNBOOK.md` §1: deployment `d5f77b8e` `2a55475` çalıştırıyordu (`4d016d2` içinde). 2026-09-29 geçişinde eski lease öncesi socket'lerin drain edildiğine dair kanıt yok; karışık sürüm penceresi yaşandıysa kaydı da yok (`CLOSING_AUDIT_2026-09-30.md`). |
| Altyapı | Migration 068 (oturum yeniden kullanımı + Firebase uid) | UYGULANDI (2026-09-30, sahip kararı) | Additive migration uygulandı: 68 ledger kaydı, checksum dosyayla eşleşiyor, sütunlar ve kısmi unique indeks var, 18 hesap değişmedi. Ardından `main` `19b6ff3` Railway'e deploy edildi (deployment `c25660ad`, SUCCESS; `/health` ve `/ready` 200). Sahip, uygulama öncesi native QA'dan ve Railway `DATABASE_URL` kontrolünden feragat etti. | Sahip + operatör | Native QA ve 24 saatlik izleme (runbook adım 8) açık; yedek arşivinin yolu ve SHA-256'sı kayıtlı değil. | Commit `19b6ff3` ("docs: record migration 068 as applied by owner decision"); [068 runbook](./MIGRATION_068_RUNBOOK.md) STATUS ve Deployed kayıtları. Önceki kanıt — 2026-09-30 disposable PG16 provası: eski binary (2a55475) 068 şemasında çalışıyor (22 PG suite, 45 test), yeni binary 067'de 503 / 068'de 200, rerun no-op, rollback SQL prova edildi; `postgres-gate` 27 dosya / 110 test geçti. Supavisor `PGOPTIONS` ve Supabase PITR doğrulanmadı. |
| Altyapı | Migration 069 (moderasyon telefon yasakları) | UYGULANDI (2026-09-30) | Yasaklı hesap silinince veya numara değiştirince eski numaranın HMAC'i saklanır; aynı numarayla açılan yeni hesap yasaklı başlar. Tek yeni tablo, additive. Migrator'ın advisory lock'u altında tek transaction'da uygulandı: 69 ledger kaydı, RLS açık, `anon`/`authenticated` SELECT yok, tablo boş. Sahip isteğiyle ayrı dump + restore testi yapılmadı. | Sahip + operatör | Saklama süresi ve admin kaldırma aksiyonu kararını ver. | Commit `d283333` ("docs: record migration 069 as applied"); [069 notu](./MIGRATION_069_NOTE.md); `authPhoneBan.contract.test.ts` bellek içi + PostgreSQL gate geçti. 069'u taşıyan binary canlıda, `/ready` 200 (2026-10-02). |
| Altyapı | Migration 070 (sohbet iletildi/okundu bilgisi) | YAZILDI, UYGULANMADI | Binary önce gider: 070'i tolere eden kod canlıda, okundu bilgisi 070 uygulanana kadar kapalı. | Sahip + operatör | Restore testli yeni yedek al, arşiv yolu ve SHA-256'yı kaydet, `DATABASE_URL` host/port'unu teyit et; sonra sahip onayıyla uygula. | [070 runbook](./MIGRATION_070_RUNBOOK.md); 2026-10-02 read-only: ledger 69 satır, 070 yok. |
| Altyapı | Veritabanı / Supabase | Release hedefi; yedek açık | Sahibin 2026-09-30 kararı: Supabase `nkqcbxufbhfibrgvajim` ve Railway `production` release hedefi; 18 hesabın hepsi sahibin test hesabı ve korunuyor. Free plan: PITR ve platform restore noktası yok. | Birlikte | Otomatik offsite yedek, tazelik alarmı ve aylık restore provasını kur; ayrı staging DB kararını ver. | 2026-10-02 read-only: ledger 69 satır (son: 069). Son kayıtlı restore testli arşiv 2026-09-30 (SHA-256 `c6cb8355…`, 68 migration); [veritabanı runbook'u](./DATABASE_RELEASE_RUNBOOK.md). |
| Güvenlik | UGC güvenliği ve kullanıcı operasyonu | Kod kısmi / operasyon açık | Sunucu filtresi, rapor/block, admin rapor kuyruğu ve kullanıcının kendi bildirimlerini görmesi kodda var. Bu filtre tam moderasyon değildir; insan triage/yanıt, erişilebilir destek, adversarial kapsam ve cihaz kanıtı yok. | Birlikte | Kuyruğu nasıl nöbetle kontrol edeceğimizi ve gerçek rapor→inceleme→genel yanıt provasını tamamla. | 2026-09-28 source tests; 4 saatte bir kontrol/4-12-24 saat hedefleri Blumi iç hedefleridir, otomasyon veya Apple SLA değildir. |
| Yayın | Apple politika sınıflandırması | Açık / yüksek risk | 5.1.1(ix) bireysel hesapla hassas veri gereksinimini; 1.2 ise anonimliğe/random chat yorumunu etkileyebilir. Kesin Apple görüşü yok. | Birlikte | Herkese açık App Store gönderiminden önce Meet with Apple üzerinden tam model için yazılı yönlendirme iste; şirket masrafı yapma. | `APP_STORE_SUBMISSION_GATE.md` içindeki taslak soru; Apple resmi kuralları ve ayrı forum tecrübeleri. Üyelik aktif. |
| Gizlilik | Hukuk sayfaları ve destek | Yayında; hukuk incelemesi açık | Beş hukuk/destek/silme yolu `www.agentsworkerplus.online` üzerinde 200 dönüyor; 2026-09-30'da üretilen HTML ile bayt bayt aynıydı ve `LEGAL_HOSTED_COPY_ALIGNMENT` "aligned". Apex host GoDaddy'de. Metnin insan/hukuk incelemesi ve destek yanıt operasyonu açık. | Sahip + ajan | Metni insan/hukuk olarak incele; destek kutusundan gerçek bir yanıt provası yap. | 2026-10-02 GET: privacy, terms, child-safety, support, delete-account 200; `apple-app-site-association` 404 (REL-12). Sahip 2026-09-28'de inbox teslimini doğruladı. |
| Yayın | App Store Connect beyanları | Taslak / açık | Listeleme/gizlilik cevapları taslak; imzalı build'e göre veri türleri, güncel yaş derecesi, DSA statüsü, ihracat uyumu, ekran görüntüleri ve Review Notes girilmedi. | Birlikte | Legacy konum saklamasını çöz; imzalı arşiv/SDK kanıtından sonra App Store Connect alanlarını tamamla. | `APP_STORE_PRIVACY_DRAFT.md`; kaynakta izlenen app manifesti veya `ios/` projesi yok; imzalı arşiv, Xcode raporu ve dış beyanlar yok. |
| Yayın | Apple hesabı / EAS / TestFlight | Dahili TestFlight çalışıyor | Apple üyeliği aktif; `Blumi QA` dahili grubunda build 5 Ready to Test oldu, sonra build 12 (preview), 13 (production, `d283333`) ve 14 (`9982882`) geldi. `testflight.yml` 2026-10-01'den beri yalnız elle çalışır. App Store gönderimi yok. | Sahip + ajan | Oda hareket istemcisini taşıyan yeni build için sahip onayıyla `testflight.yml`'i elle çalıştır. | `8d46d08`; `OPEN_WORK_2026-09-30.md` §0; build 14'te motion client yok (`ENGINEERING_AUDIT_2026-09-30.md`); EAS projesi `@erenaksu/blumi`. |
| Mobil | Gerçek cihaz ve bildirim | Açık | TestFlight build 12 sahibin telefonunda; push teslimi, gerçek OTP ve iki hesaplı akış kanıtlanmadı. Yüklü hiçbir build canlı oda hareketini taşımıyor. | Birlikte | Güncel build ile iki telefonda push ve eşleşme→sohbet→oda provası yap. | `OPEN_WORK_2026-09-30.md` §0; APNs/FCM gerçek teslimi yok; EAS'taki APNs anahtarı doğrulanmadı. |
| Operasyon | Admin ve izleme paneli | Kısmi: canlıda | Yeni admin konsolu (Genel Bakış/İş Analizi, metrik API'si, rapor kuyruğu) canlıda. Online ve rapor verisi 60 sn'de, ağır iş analizi 5 dk önbellekle yenilenir. Sağlayıcı maliyeti, uptime alarmı ve bazı ürün metrikleri ölçülmüyor. | Ajan | Ayrı operatör kimliğiyle rapor kuyruğunu ve metrikleri canlıda prova et. | 2026-10-02: `/admin` 200 ("Blumi · Yönetim merkezi"), `/v1/admin/analytics` token olmadan 401. 2026-09-28 yerel suite 518 passed / 23 skipped. |
| Operasyon | Kesintisiz izleme ve harcama | Kurulu değil | Dört saatlik rapor kuyruğu kontrolü insan operasyon hedefidir; uptime, hata oranı, SMS harcaması veya bütçe için otomatik alarm değildir. | Birlikte | Gerekirse ücret ve erişim sınırları belli, ayrı onaylı bir alarm/monitoring düzeni seç. | 2026-09-30 Codex heartbeat'leri yerel build, sunucu, yedek ve smoke kontrolleridir; harici uptime veya harcama alarmı değildir. |
| Operasyon | Disk alanı | Temizlendi | Derleme/paket önbellekleri temizlendi; kaynak kodu, indirmeler, yedekler ve Simülatör kullanıcı verileri korunup değişmedi. | Ajan | Native derleme başlamadan boş alanı tekrar ölç. | 2026-09-28 `df -h /`: 9.6 GiB boş (yaklaşık 10.3 GB). |

## Work in the right order

### 1. Protect environments and the current data

**Status: OPEN · Owners: Owner + agent**

- Settled 2026-09-30: Supabase `nkqcbxufbhfibrgvajim` and Railway `production` are the release target and are handled as production; the owner's 18 test accounts are kept. This supersedes the earlier items "establish what the connected database is for" and "never use the unidentified database as a migration target".
- Before each production schema change: a fresh backup with restore proof, the owner's approval, an idempotent rerun and a readiness check. A separate staging database is recommended and still open.
- Offsite automated backups, a freshness alarm and a monthly restore drill remain open; the Supabase Free plan has no PITR.
- The 2026-09-27 and 2026-09-28 database snapshots in older sections are dated evidence. Current numbers are in the [runbook](./DATABASE_RELEASE_RUNBOOK.md).

### 2. Make local verification reproducible

**Status: TECHNICAL PASS · RELEASE SCOPE OPEN · Owners: Owner + agent**

- `npm run verify` passed on 2026-09-27 under Node 22.22.2 and again on 2026-09-30. (Superseded: `.nvmrc` pins 22.23.3 since `efca2d1`; run `nvm use` in each development terminal, since the login shell defaulted to Node 20.20.1.)
- The Operations Center recomputes local Git change counts on each page request without exposing filenames. Automated checks do not identify which changes are approved for release; review and freeze that scope before creating a release candidate.
- A fresh Expo iOS export completed on 2026-09-27 (4,284 modules; 1,081 assets; 55 MB) but included candidate onboarding artwork. (Superseded 2026-09-30: candidate imports are 0 and the release guard passes.) A JavaScript export is not native, Simulator or device proof.

### 3. Bring up a safe staging service

**Status: OPEN · Owners: Owner + agent**

- Railway is linked to the repository with one `production` environment (service `blumi-app`). A separate `staging` environment is open; reconcile `.railway/railway.ts` with the live project first.
- Add secrets only in Railway's secret-variable UI. Review each infrastructure plan before applying it.
- Deploy staging first; prove `/health`, `/ready`, API auth, database readiness, and rollback identity. Verify Railway actually waits for GitHub CI before autodeploy.
- The realtime lease cutover is done (live since 2026-09-29). For any rollback to a pre-lease binary: stop new-version admission, drain all lease-aware sockets, then restore the old binary. Do not use a mixed rolling cutover; if the actual Railway sequence cannot guarantee these steps, **STOP the deployment**.
- Do not point staging and production at the same database or payment webhook.

### 4. iOS distribution

**Status: INTERNAL TESTFLIGHT WORKING · Owners: Owner (account) + agent (setup)**

- Done: Apple Developer membership is active, EAS project `@erenaksu/blumi` is linked, internal group `Blumi QA` exists, and builds 5, 12, 13 and 14 reached TestFlight.
- Open: the APNs key in EAS and real push on two devices; a new build that carries the room motion client; inspection of the exact signed archive; App Store submission, which is a separate gate.
- Keep Android internal testing as a separate follow-up unless the owner chooses a simultaneous launch.

### 5. Verify real providers and store rules

**Status: OPEN · Owners: Owner + agent**

- Phone authentication: test real-device verification and account recovery; monitor provider usage/cost.
- Push: APNs/FCM credentials and real token delivery on two devices.
- Voice, when re-enabled: LiveKit staging, invitations, reconnect, local/remote voice, and default muted/off on two accounts.
- Payments, when enabled: RevenueCat sandbox products/webhook, duplicates, restore/refund, and cross-account protections; never mix sandbox with production.
- Legal/store: hosted privacy/terms pages are live; align app metadata, support contact, age/safety disclosures, and review notes. Human/legal approval is not inferred from passing tests.

### 6. Prepare human operations before inviting the public

**Status: OPEN · Owner: Joint**

- Define who can review/resolve user reports and recover accounts, and how incidents are escalated.
- Backend admin access is token-based and narrowly scoped. Keep operator identity separate from Eren's normal app account.
- The Operations Center is read-only and owner-private. Any control panel must use separate operator authentication, least privilege, and audit records; never expose admin secrets to the mobile app.
- Add external uptime checks, cost alerts, backup/restore verification, and a rollback drill. Railway's deployment healthcheck alone is not continuous uptime monitoring.

## Existing automation

- **Already in the repository:** GitHub Actions `Verify` runs the full `npm run verify` workflow on pull requests and pushes to `main`.
- **Prepared, not applied:** `.railway/railway.ts` describes CI-gated deployment and a `/ready` health check, but it does not match the live project (see the Railway row).
- **Founder monitoring:** the Codex 15-minute check-in was canceled at the user's request on 2026-09-27. The local panel does not run in the background, send alerts, or read provider telemetry. (Superseded 2026-09-30: Codex thread heartbeats for build, server, backup and smoke checks were set up; see the operations automation section.)
- **Not yet configured:** external uptime monitoring and spend alerts. Updated 2026-10-02: every EAS build/OTA workflow in `apps/mobile/.eas/workflows/` and `.github/workflows/develop-ota-publish.yml` runs by hand (`testflight.yml` since `8d46d08`); `testflight-after-asc-upload.yml` fires on App Store Connect uploads.

## Immediate next action

**Run the open native P0 checks on the current build:** use a development build against Metro from `develop` (`76a195e`), or, with the owner's approval, start a new TestFlight build by hand; then run the P0 items in `NATIVE_QA_WAVE_2026-09-30.md` and a two-phone match → chat → room pass that includes live room motion. Before any public App Store submission, ask Apple the 5.1.1(ix)/1.2 questions in [`APP_STORE_SUBMISSION_GATE.md`](./APP_STORE_SUBMISSION_GATE.md); do not pay to form a company or describe Blumi as random/anonymous chat on a guess. Migration 070, offsite backups and human legal review remain separate open gates.

## Status meanings

- **Implemented:** present in this checkout.
- **Tested:** named automated checks passed on the stated checkout/runtime.
- **Native verified:** inspected in the actual iOS/Android build or device flow.
- **External verified:** provider account, deployment, or service was checked directly.
- **Waiting on user:** needs the user's account action, decision, or approval.
- **Open / Blocked:** evidence is missing or a prerequisite failed. These do not count as launch-ready.
