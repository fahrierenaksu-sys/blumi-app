# Blumi oturum envanteri (develop @ 99a29d1, 2026-10-01)

## Türkçe özet

Yalnızca okuma yapıldı; repoda hiçbir dosya değişmedi. Envanter şu kaynaklardan çıkarıldı: 2026-09-30 ve 2026-10-01 tarihli `docs/quality` ve `docs/release` belgeleri, 17 workflow journal'ı ve 30.09'dan bu yana `develop` üzerindeki commit'ler.

Usage limitinde kesilen eski workflow'lardaki onaylanmış bulguların hepsi tabloda: wf_209cc2d4, wf_a7059243, wf_9a6e3a2f (research:stack ile birlikte) ve wf_313361bf. Auth, privacy ve safety listeleri de tam olarak alındı. Bu workflow'ların hiçbirinin fix aşaması tamamlanmadı; bulguların büyük kısmı sonradan ayrı commit'lerle kapatıldı.

Ucuz olduğu yerde "yapıldı" iddiası kodla karşılaştırıldı. Kodla doğrulanan bazı durumlar:
- Pool `error` listener var (`databasePoolConfig.ts:87`).
- İkinci askı artık önceki uzun askıyı kısaltmıyor (`postgresSafetyRepository.ts:376-381`).
- Fastify 5.12.5'te.
- Wardrobe kartında `transition={0}` var.
- Kalan frame-loop borcu tek dosya.

Hiçbir madde native ortamda doğrulanmadı. "DONE" kodun commit'lenip test edildiği anlamına gelir; Simulator veya telefon kanıtı her maddede hâlâ açık. `develop`, `origin/develop`'tan 20 commit ileride (push edilmedi), deploy yok, migration 070 uygulanmadı.

**Kapsam dışı bırakılanlar** (başka bir mühendis üzerinde çalışıyor): oda çıkış hatası (17cc370, 2a85f47); sparkle balonu ve eski UI temizliği (3dd5fcb, f497d6b, demo lobi ve CHT-17); Firebase refresh iptali (615da71, auth#2); hesap silmede güvenlik kanıtı (05ff8a9, DB-15, safety#2, privacy#1, auth#3); delivery ack düşmesi (5176455, 8e00798, receipts#0, merge#1, security#1); `avatar_moved` yeniden senkronu (3692bf3, motion#1).

**Duruma göre sayılar (252 kalem):**

| Durum | Sayı |
|---|---|
| DONE | 73 |
| PARTIAL | 33 |
| NOT STARTED | 106 |
| NEEDS OWNER DECISION | 32 |
| NEEDS NATIVE CHECK | 8 |

**En önemli 15 açık iş:**
1. **MR-11 / REL-02 (P0):** Hiçbir yüklü build canlı oda hareketini taşımıyor (build 14'te motion client yok). Sunucu düzeltmeleri deploy edilmedi ve `develop` push edilmedi. Sahibin kararı gerekiyor: yeni build/OTA ve deploy.
2. **BE-36 (P0):** Yedek yok. Supabase Free'de PITR yok, son restore-test edilmiş yedek 2026-09-28 tarihli; 067, 068 ve 069 bu yedekten sonra uygulandı.
3. **PSH-01 / REL-13 (P0):** EAS'ta APNs anahtarı yüklü mü bilinmiyor. İki fiziksel telefonla push testi yapılmadı.
4. **AF-01 (P0):** Erkek Soft Patch Beanie saçın altında çiziliyor. Yalnızca veriyle düzeltilebilir.
5. **NQA-1 (P0):** 105 maddelik native QA planı (24'ü P0) hiç çalıştırılmadı.
6. **REL-08/09/10/11/12 (P0):** App Store engelleri: imzalı arşiv incelemesi, App Store Connect formları, Apple 5.1.1(ix)/1.2 sınıflandırması, hukuk sayfaları ve AASA 404 veriyor.
7. **BE-12 (P1):** 409/503 hata eşlemesi production'da çalışmıyor. `databaseErrorStatus.ts:34` `name === "DatabaseError"` kontrol ediyor, pg ise `"error"` veriyor; gerçek hatalar 500'e düşüyor.
8. **CH-01 (P1):** Mesaj belirtmeden yapılan okuma `readUpTo`'yu sunucu saatine çekiyor. Henüz ekranda görünmemiş bir mesaj "okundu" sayılabiliyor.
9. **BE-29 (P1):** Aynı kişiye ikinci rapor öncelik yükseltmesini kaybediyor (spam'den sonra underage standart kuyrukta kalıyor).
10. **BE-14 (P1):** Push transaction'ı ve cihaz kilidi Expo HTTP çağrısı boyunca açık kalıyor; COMMIT hatasında push iki kez gidiyor.
11. **CH-08 (P1):** Migration 070 yazıldı ama uygulanmadı. Okundu bilgisi uygulanana kadar kapalı; önce yedek ve geri yükleme kanıtı lazım.
12. **BE-03 / BE-04 (P1):** 401 IP kilidi bir CGNAT adresinin arkasındaki herkesi kilitliyor. Loglarda `streamError`/`serializerError` hâlâ hata mesajını yazıyor.
13. **VIS-01..05 + ROOM-05 (P1):** Oturma ofseti formülü, oturma/kalkma geçişi yok, yürürken ayak kayması, MiniRoom'da avatar hep eşyanın üstünde, yatak koltuğunun yönü yanlış.
14. **ONBV-01 (P1):** Önceden mount edilen adım yüzünden Android geri tuşu profil ve avatar adımında çalışmıyor (Android henüz yayında değil).
15. **SEC-D (P1):** UGC moderasyonu dar bir ifade filtresinden ibaret (Apple 1.2 riski).

---

## Full inventory

Status meanings: DONE = committed and covered by named tests, but no native evidence. PARTIAL = what is still missing is stated. "Verified" in a row means the current code was checked for this report.

| ID | Title | Source | Status | Severity |
|---|---|---|---|---|
| BE-01 | Every authenticated request made 5-7 sequential DB round trips (session resolved 2-3x + rate-budget UPSERT) | wf_209cc2d4 audit:http#0, audit:db#3, audit:auth#0; DB-04 | PARTIAL: session resolved once (221a49b, a87f766, 3eb4820, 03931bd). Missing: the Postgres shared rate-budget UPSERT still runs per request on a single replica (method:4 F4) | P1 |
| BE-02 | /v1/discover limit keyed on unverified bearer hash (rotating fake tokens bypass IP limit) | audit:http#1 | DONE 89001ee | P1 |
| BE-03 | Per-IP limits punish CGNAT/shared networks; ticket 30/min/IP | audit:http#2, REALTIME_CAPACITY §6.4 | PARTIAL 89001ee, 9ecf8d2. Missing: 100x401 lock blocks every user behind one NAT IP incl. valid tokens; any "Bearer x" gets the 1000/min ceiling on public routes (requestLimits.ts:28,121) | P1 |
| BE-04 | Request logs wrote raw URLs (ids, cursors) and client IPs | audit:http#3, runtime#1, ops#2, privacy#2, SEC-R5 | PARTIAL d918772 (route templates). Missing: streamError/serializerError not overridden, still log err message (privateRequestLog.ts) | P1 |
| BE-05 | Production booted without BLUMI_TRUST_PROXY | audit:http#4, auth#1 | DONE 3b32546 | P2 |
| BE-06 | Discovery snapshots unbounded (500 MB risk) | audit:db#0, workers#2, DB-02 | DONE fffe4fd (text[] per snapshot left as optional migration) | P0 |
| BE-07 | Realtime pong = 4-round-trip transaction per socket | audit:db#1, DB-03 | DONE cba4e72, d0a49e2, 9ecf8d2 | P1 |
| BE-08 | 30 s realtime authorization sweep = 2 queries per socket | audit:db#2 | DONE 9ecf8d2 (batched 500/sweep) | P1 |
| BE-09 | Outbox, push receipt and audit tables never pruned | audit:db#4, workers#1, privacy#0, DB-05 | DONE 13a39a5 (follow-up: no index on completed_at/occurred_at; never-completed outbox rows never pruned) | P1 |
| BE-10 | OTP send claim deletes expired rows before advisory lock (deadlock) | audit:db#5 | NOT STARTED (verifiers could not reproduce; intent-only) | P3 |
| BE-11 | No statement/lock/idle-in-transaction timeout; pool waited forever | audit:db#6, DB-08 | PARTIAL f863ffa (pool wait 10 s, keepalive). Missing: statement_timeout opt-in only (unset by default), idle_in_transaction/lock_timeout need role-level ALTER ROLE (owner) | P2 |
| BE-12 | DB error mapping 409/503 | DB-06, method:4 F1 | PARTIAL 4c24fbc is broken in production: databaseErrorStatus.ts:34 checks error.name === "DatabaseError" but pg sets name "error", so real SQLSTATEs fall to 500; tests use fake errors | P1 |
| BE-13 | pg Pool had no 'error' listener (idle disconnect crashes the only replica) | ops#0, DB-07 | DONE f863ffa (databasePoolConfig.ts:87,92) | P0 |
| BE-14 | Push dispatch held up to 100 pooled transactions across Expo HTTP | workers#0, notifications#0, scale#0, method:2 §4 | PARTIAL 12e73d4 (concurrency 3, 30 leased). Missing: transaction + device row lock still open across the Expo call (postgresNotificationRepository.ts:32); COMMIT failure re-sends the push | P1 |
| BE-15 | Railway draining 0 s, graceful shutdown never ran | runtime#0, workers#3, ops#1 | DONE d270ae4 (drainingSeconds 35) + c1e5961 | P1 |
| BE-16 | Start command goes through npm, SIGTERM may not reach Node | runtime#0 | NEEDS NATIVE CHECK (deploy-log check: start is still "npm --workspace @blumi/server run start") | P2 |
| BE-17 | Discovery Watch cycle stopped at first watch with no candidate | workers#4 | DONE 43e182e | P1 |
| BE-18 | Chat delivery jobs retry forever; failures never logged | workers#5 | PARTIAL: reportError wired (index.ts:76); no attempt ceiling found | P2 |
| BE-19 | Unhandled rejection / uncaught exception handler | ops#5 | DONE c1e5961 | P2 |
| BE-20 | fastify GHSA-4mh8-r7rc-xpvc fails audit:release | runtime#2, research 2a | DONE (lockfile fastify 5.12.5, 3e98bce) | P1 |
| BE-21 | Every push to main redeploys backend (docs/mobile too) | ops#3 | NOT STARTED (.railway/railway.ts has no watch patterns) | P2 |
| BE-22 | Live Railway service drifted from .railway/railway.ts (name, CI gate, restarts) | ops#4, REL-7 | NEEDS OWNER DECISION | P2 |
| BE-23 | No production runtime metrics (event-loop lag, pool saturation, backlog) | ops#6, REL-14 | NOT STARTED | P2 |
| BE-24 | Production build ships whole monorepo (~1.1 GB node_modules) | runtime#3 | NOT STARTED | P2 |
| BE-25 | Refund reversal debited coins without a recorded credit | economy#0, method:4 F3 | PARTIAL f5a0c64. Missing: concurrent credit+reversal race (per-transaction advisory lock) | P2 |
| BE-26 | Unappliable signed RevenueCat events acked 200 and discarded | economy#1, SEC-R10 | NOT STARTED (needs migration; payments off) | P2 |
| BE-27 | Moderation queue showed only newest 50-100 reports | safety#0 | DONE 6615739 (keyset, risk order) | P1 |
| BE-28 | Reports/blocks unbounded per user | safety#1, SEC-R9 | DONE 6615739 | P1 |
| BE-29 | Report dedupe drops escalations (spam then underage stays standard priority) | method:4 F2 | NOT STARTED (verified postgresSafetyRepository.ts:174-178 returns "replayed") | P1 |
| BE-30 | Block refused at 1000 blocks (user cannot block an abuser) | method:4 F2 | NOT STARTED (safetyService.ts:158) | P2 |
| BE-31 | Second suspension shortened a longer one | safety#3 | DONE (postgresSafetyRepository.ts:376-381; 6615739/05ff8a9) | P2 |
| BE-32 | No admin path to lift ban/suspension or phone ban | safety#4, PRD-6 | NEEDS OWNER DECISION | P2 |
| BE-33 | Room showcase URL = unsalted sha256(userId, revision), served unauthenticated (bypasses mutual-like gate/blocks) | privacy#3 | NOT STARTED (verified roomSnapshotRenderer.ts:150) | P2 |
| BE-34 | RLS off on 57 tables; 10 functions mutable search_path; index/invariant DDL | privacy#4, DB-10..13 | NEEDS OWNER DECISION (DDL P-01..P-05 proposed, unapplied) | P3 |
| BE-35 | blumi_media_revocations grows without LiveKit | DB-14 | NOT STARTED | P3 |
| BE-36 | Backups: no PITR, last restore-tested dump 2026-09-28; S3 cron unproven | DB-09, REL-4, REL-6, research 5 | NEEDS OWNER DECISION | P0 |
| BE-37 | Like push no longer carries liker id, so block/report never cancels a queued like push | notifications#1, merge#0, security#2 | NOT STARTED (verified matchService.ts:381 vs notificationDeliveryContext.ts:95) | P2 |
| BE-38 | Open conversation POSTs /read per incoming message (8-12 round trips + NOTIFY) | scale#1 | PARTIAL 911e075 (500 ms debounce) | P2 |
| BE-39 | MiniRoom move waited on auth/room queries | scale#2, motion#2 | DONE 9ecf8d2, 1227246, e8847d5 | P1 |
| BE-40 | Movement/ack frames dropped silently; ack map scan per frame | security#0 | DONE 9ecf8d2 (per-class event budget; not re-verified) | P1 |
| BE-41 | Transient ledger-probe error turned receipts off | receipts#1 | DONE (probe fails closed, cached 30 s; method:2) | P3 |
| BE-42 | Chat send: 11-16 sequential statements | BACKEND_TECH_DECISION, REALTIME_CAPACITY §6.1, RT-06 | DONE 362c335, c3fa022, beba0c3, 03931bd | P1 |
| BE-43 | Push sign-out cleanup depends on in-memory token; foreground ignores recipientUserId | notifications#2 | DONE 3e9773d, 06d9a6b (not re-verified) | P2 |
| RT-01 | Silent-socket reconnect has 0 ms jitter (herd after a server stall) | method:1 §2 | NOT STARTED | P2 |
| RT-02 | 1011 and ticket 503 not treated as server_wide; Retry-After ignored | method:1 §2 | NOT STARTED (realtimeClient.ts:47) | P2 |
| RT-03 | ws closeTimeout 30 s equals shutdown deadline (flush/fanout skipped, exit 1) | method:1 §3 | NOT STARTED (no closeTimeout set) | P2 |
| RT-04 | DB outage >60 s: auth cache expiry closes all sockets 1011 (herd) | method:1 §4 | NOT STARTED | P2 |
| RT-05 | chat.send_message handled 4 in flight per socket (can commit out of order) | method:1 §5 | NOT STARTED | P2 |
| RT-06 | Reconnect resync has no resume cursor (only last message, max 5 threads) | method:1 §9 | NOT STARTED | P2 |
| RT-07 | Connection leases written for retired room presence (deny-all) | method:1 §10 | NOT STARTED | P2 |
| RT-08 | LISTEN drop during deploy overlap loses a new peer's events without onGap | method:1 §7 | NOT STARTED | P3 |
| RT-09 | Transaction pooler + BLUMI_DB_LISTEN_URL for more pool headroom | method:1 §6, REALTIME_CAPACITY §5/§6.7 | NEEDS OWNER DECISION (staging test) | P2 |
| RT-10 | Fixed-window event budget (2x burst at boundary) -> GCRA | method:1 §5 | NOT STARTED | P3 |
| CH-01 | Read without upToMessageId publishes readUpTo at server time: message can be "read" before it is shown | method:2 §2 | NOT STARTED (postgresChatReceipts.ts:180) | P1 |
| CH-02 | Reads made with receipts off revealed retroactively when both enable | method:2 §2 | NEEDS OWNER DECISION | P2 |
| CH-03 | Push sent for every message even when recipient is in the thread (delay 2-3 s, skip if delivered) | method:2 §4 | NOT STARTED | P2 |
| CH-04 | Worker dispatchDue sends a thread's jobs in parallel (order after restart) | method:2 §5 | NOT STARTED (chatMessageDeliveryService.ts:173) | P2 |
| CH-05 | Preview tie-break (sent_at vs sent_at,message_id); md5 lease token | method:2 §1 | NOT STARTED | P3 |
| CH-06 | Typing: block query per signal; ref written during render | method:2 §3 | NOT STARTED | P3 |
| CH-07 | Receipt-stage MessageRateExceeded cannot be re-sent (needs migration) | PUSH_PROGRESS | NEEDS OWNER DECISION | P3 |
| CH-08 | Migration 070 (receipts) written, not applied; receipts off until applied + rollout | PUSH_PROGRESS, MIGRATION_070_RUNBOOK | NEEDS OWNER DECISION (backup + restore proof first) | P1 |
| CH-09 | Privacy text update for read receipts | PUSH_PROGRESS | NOT STARTED | P2 |
| CH-10 | Invite-accepted push; in-app language sent to server (migration) | PUSH_PROGRESS | NEEDS OWNER DECISION | P3 |
| CH-11 | Room chat sentAt >= baseline-250ms filter vs clock skew | TASKS RT-09 | NOT STARTED (unverified in field) | P3 |
| MR-01 | Receiving phone re-resolved partner target; phones disagreed | motion#0 | DONE c98a5ce | P1 |
| MR-02 | Second device of same user does not follow own avatar from other device | motion#3, PUSH_PROGRESS | NOT STARTED | P2 |
| MR-03 | hotspotId moves skip floor check; server has no seat manifest (two world models) | method:3 §1 | NOT STARTED (miniRoomMotionService.ts:277) | P2 |
| MR-04 | Device takeover: auto-reconnect of an old phone retakes the scene | method:3 §2 | PARTIAL 9575d7b (same-session sockets). Missing: resume flag across devices | P2 |
| MR-05 | Partner walk segments chained via scheduleOnRN at corners (hitch when JS busy) | method:3 §4, ROOM-02 | PARTIAL 7243477, c607202. Missing: withSequence on UI thread | P2 |
| MR-06 | keepWarm re-check every 10 s (500 rooms = 100 rt/s) | method:3 §3, REALTIME_CAPACITY §6.5 | NOT STARTED | P3 |
| MR-07 | Invite expiry uses device clock | method:3 §5 | NOT STARTED | P2 |
| MR-08 | Match: crash between statements leaves likes without match; block TOCTOU (no NOT EXISTS) | method:3 §6, method:4 F7 | NOT STARTED (postgresMatchRepository.ts has no safety_blocks) | P2 |
| MR-09 | Match reward/push run in memory after response (lost on crash) | method:3 §6, method:4 F9 | NOT STARTED (transactional outbox) | P2 |
| MR-10 | Discover decision retry retries 429 at 400/1200 ms ignoring Retry-After | method:3 §7 | NOT STARTED (discoveryDecisionRetry.ts:19) | P3 |
| MR-11 | Two-phone live motion: build 14 has no motion client | ENGINEERING_AUDIT "MiniRoom live motion" | NEEDS OWNER DECISION (new build/OTA + server deploy) | P0 |
| MR-12 | Seat claims server-authoritative; starter bed seat | PUSH_PROGRESS | DONE 5fac59a, 4a40000 | P1 |
| MR-13 | Multi-instance MiniRoom state diverges | REALTIME_CAPACITY §6.6 | NOT STARTED (not needed at 1 replica) | P3 |
| VIS-01 | Seated offset formula 47 + seatHeight*stage (77.6 pt drop vs 10 pt art) (U2) | research:upgrade | NOT STARTED (needs Simulator confirmation) | P1 |
| VIS-02 | Procedural sit/stand transition (U1) + approach-turn-settle (U4) | research:upgrade | NOT STARTED | P1 |
| VIS-03 | Stride-locked walk + bob (moonwalk) (U3) | research:upgrade | NOT STARTED | P1 |
| VIS-04 | MiniRoom avatars always drawn above furniture (U7 = ROOM-05) | research:upgrade, UX_DELIGHT ROOM-05 | NOT STARTED | P1 |
| VIS-05 | Data-driven seat rigs; bed seat faces "left" with no art (U5) | research:upgrade | NOT STARTED | P1 |
| VIS-06 | Collision clearance 0.012 vs avatar width (U8) | research:upgrade | NOT STARTED (roomWorldRuntime.ts:14) | P2 |
| VIS-07 | Occlusion masks for furniture fronts (U9, 4 bed PNGs via Workbench) | research:upgrade | NEEDS OWNER DECISION | P2 |
| VIS-08 | Editor placement guides + draw authored contact shadows in production (U10) | research:upgrade | NOT STARTED | P2 |
| VIS-09 | One motion clock / consistent scale / frame prefetch (U11-U13) | research:upgrade | NOT STARTED | P3 |
| VIS-10 | Navmesh with clearance (U14, only with 20+ blockers) | research:upgrade | NOT STARTED | P3 |
| VIS-11 | Skia measured slice (T1); Skia 2.6.2 broken on RN 0.86 Android, pin >=2.11.1 | research:twofive | NEEDS OWNER DECISION | P2 |
| VIS-12 | Spine Pro ($379-449/seat) for V3 rig | research:twofive | NEEDS OWNER DECISION | P2 |
| VIS-13 | True 3D / impostor-in-3D | research:threed | NEEDS OWNER DECISION (recommendation: reject full 3D, park impostor) | P3 |
| AF-01 | Male Soft Patch Beanie drawn under hair (layer order) | ASSET_FIT_AUDIT | NOT STARTED (data-only fix) | P0 |
| AF-02 | Default female Denim Skort reads as jeans standing, skirt sitting (ID drift) | ASSET_FIT_AUDIT | NEEDS OWNER DECISION (redraw) | P1 |
| AF-03 | Horizontal light lines in male shorts/baggy pants walk frames | ASSET_FIT_AUDIT | NOT STARTED (Workbench re-export) | P1 |
| AF-04 | Hard/jagged alpha edges (cargo, track, coral wave, shoes, seated cuffs) | ASSET_FIT_AUDIT | NOT STARTED (Workbench) | P1 |
| AF-05 | 14 orphan PNGs + 97 unused 512x768 profile layers (3.7 MB) in bundle | ASSET_FIT_AUDIT | NOT STARTED | P2 |
| AF-06 | Automated guards (canvas, alpha halo, layer order) | ASSET_FIT_AUDIT | NOT STARTED | P2 |
| ONBV-01 | Android hardware back dead on profile/avatar steps after pre-mount | onboarding-verify F1 | NOT STARTED (onboardingScreenActions.ts:60 has no active arg; Android unreleased) | P1 |
| ONBV-02 | Scan laser decoded 25x larger than drawn on cold start | onboarding-verify F2 | NEEDS OWNER DECISION (Workbench 804x78 asset) | P1 |
| ONBV-03 | Greeting wave/profile reaction still JS timers; frames preloaded under Reduce Motion (ONB-04) | onboarding-verify F3 | PARTIAL c6934c6 | P1 |
| ONBV-04 | Intro frame sampler re-arms and grows unbounded | onboarding-verify F4 | NOT STARTED | P2 |
| ONBV-05 | Greeting text reveal animates width | onboarding-verify F5 | NOT STARTED | P2 |
| ONBV-06 | SwipeDismissSheet self presentation unused; interrupted close locks sheet; first-frame flash | onboarding-verify F6 (SYS-4/5) | PARTIAL e9a7047 | P2 |
| ONBV-07 | Runner orbit snaps to start on resume; handoff easing mix | onboarding-verify F7, F8 | NOT STARTED | P2 |
| ONBV-08 | Any BlumiLoadingScreen marks itself as boot surface | onboarding-verify F9 | NOT STARTED | P2 |
| ONBV-09 | 600 ms pre-mount heavy JS render; decoded memory keeps growing (~60 MB) | onboarding-verify F10, F11 | NOT STARTED | P2 |
| ONBV-10 | OTP retype after transient error does not auto-submit | onboarding-verify F12 | NOT STARTED | P2 |
| ONBV-11 | Step activated with keyboard open does not know it | onboarding-verify F13 | NOT STARTED | P2 |
| ONBV-12 | Placed-bed drag still JS touch events | onboarding-verify F14 (ONB-11) | PARTIAL ffa04f3, d2d6a56 | P2 |
| ONBV-13 | Hidden pre-mounted room step keeps marker pulse | onboarding-verify F15 | NOT STARTED (plausible) | P3 |
| ONBV-14 | Splash mark decoded 7.6x | onboarding-verify F16 | NEEDS OWNER DECISION (Workbench) | P3 |
| ONB-01 | Boot scan restarts on cold open | UX_DELIGHT | DONE 5e69aea | P0 |
| ONB-02 | Scan characters vanish in one frame | UX_DELIGHT | DONE 046f486 | P1 |
| ONB-03 | Intro JS bridge busy every frame | UX_DELIGHT, MQ-3, TD-2 | DONE 32aad39 | P1 |
| ONB-05 | Whoa handoff waits for disk write | UX_DELIGHT | DONE e7330ec | P1 |
| ONB-06/07 | Edge back exits setup; no step direction | UX_DELIGHT | DONE 96110d0 (caused ONBV-01) | P1 |
| ONB-08 | Hidden steps follow the keyboard | UX_DELIGHT | DONE 0cbd9ac | P2 |
| ONB-09 | Profile field errors on first key | UX_DELIGHT | DONE 704b5fd | P1 |
| ONB-10 | Character blinks out on each change in studio | UX_DELIGHT | DONE 1658808 | P1 |
| ONB-11 | First-room bed drag (ROOMSETUP-1) | UX_DELIGHT, UX_MOTION | DONE ffa04f3 (see ONBV-12) | P1 |
| ONB-12 | OTP focus/auto-verify/shake | UX_DELIGHT | DONE ee06ca0 | P1 |
| ONB-13 | No "you did it" moment after account creation; navigator rebuild | UX_DELIGHT | NOT STARTED | P1 |
| ONB-14 | Mixed TR/EN in setup | UX_DELIGHT | DONE e6cfb6e | P1 |
| ONB-15 | Gender tap blank frame (atlas decode) | UX_DELIGHT | DONE 3f49568 | P2 |
| ONB-16 | Signed-in setup waits on server for "Karakterim hazır" | UX_DELIGHT | NOT STARTED | P2 |
| ONB-17 | Contextual notification pre-prompt | UX_DELIGHT, P-01 | DONE 911e075 | P2 |
| ONB-18 | Account recovery modal feedback (UX-2) | UX_DELIGHT, OPEN_WORK UX-2 | PARTIAL a029913 (no separate screen/country picker per UX-2) | P2 |
| DSC-01 | Match moment English on Turkish devices | UX_DELIGHT | DONE ea57b35 | P1 |
| DSC-02 | Match card pops from 0; haptic before card | UX_DELIGHT | DONE d75cc1f | P1 |
| DSC-03 | Match modal shows hash avatar not partner's chibi | UX_DELIGHT | DONE a12ada6 | P1 |
| DSC-04 | VoiceOver reads only "flip profile" on Discover card | UX_DELIGHT | NOT STARTED (SwipeableDiscoverCard.tsx:374) | P1 |
| DSC-05 | Story bars and fake online dot without data | UX_DELIGHT | NEEDS OWNER DECISION | P1 |
| DSC-06/07 | Card physics on a rail; flip not a real 3D card turn | UX_DELIGHT | NOT STARTED | P1 |
| DSC-08 | Card back showcase covers panel (SE 112 px), large text clipping | UX_DELIGHT | NOT STARTED | P1 |
| DSC-09 | Profile edit loses unsaved changes | UX_DELIGHT | DONE b53a19f | P1 |
| DSC-10 | Rapid swipes; like haptic delay; button exit ignores Reduce Motion | UX_DELIGHT | PARTIAL 23e3608 | P2 |
| DSC-11 | Next card pops in; frost lingers; empty state in one frame | UX_DELIGHT | NOT STARTED | P2 |
| DSC-12 | Limit screen says "00:00 UTC", hard-coded 10, dead rewarded-ad row | UX_DELIGHT | NOT STARTED (discoverySurfaceCopy.ts:99) | P2 |
| DSC-13 | Filter sheet age stepper | UX_DELIGHT | DONE 9fbbb4b | P2 |
| DSC-14 | "Passed for now" pill hidden behind nav | UX_DELIGHT | NOT STARTED | P3 |
| DSC-15 | ProfilePreview bounce/haptics | UX_DELIGHT | DONE 63c345a | P2 |
| DSC-16 | Back icons/sign-out duplication/iOS row highlight | UX_DELIGHT | DONE 7ec258d | P3 |
| CHT-01 | Toast for every message in open chat | UX_DELIGHT | DONE cd74344 | P0 |
| CHT-02 | Toast covers composer and blocks taps | UX_DELIGHT | NOT STARTED | P1 |
| CHT-03 | 34 pt gap between composer and keyboard | UX_DELIGHT | NOT STARTED | P1 |
| CHT-04 | Own-message entrance remounts on server ack | UX_DELIGHT | DONE f2524c8 (not re-verified) | P1 |
| CHT-05 | No scroll-to-latest | UX_DELIGHT | DONE f2524c8 | P1 |
| CHT-06 | Read chats reappear unread | UX_DELIGHT, CHAT-RT-04 | DONE 911e075, e426714 | P1 |
| CHT-07 | Failed message nearly invisible; English toast title | UX_DELIGHT | NOT STARTED | P1 |
| CHT-08 | Inbox getItemLayout mismatch | UX_DELIGHT | DONE 8770a75 | P1 |
| CHT-09 | Inbox unread/preview readability | UX_DELIGHT | DONE 8770a75 | P2 |
| CHT-10 | Inbox list jumps when a thread moves to top | UX_DELIGHT | NOT STARTED | P2 |
| CHT-11 | Message grouping and time format | UX_DELIGHT | PARTIAL 7f70360 (5-min grouping; 24h/10 pt time not changed) | P2 |
| CHT-12 | Load-earlier only by button, re-renders all rows | UX_DELIGHT | NOT STARTED | P2 |
| CHT-13 | Invite busy re-renders every row | UX_DELIGHT | NOT STARTED | P3 |
| CHT-14 | Report-and-hide flow feedback | UX_DELIGHT | NOT STARTED | P2 |
| CHT-15 | Room invite sent on one tap; confirm? | UX_DELIGHT | NEEDS OWNER DECISION | P2 |
| CHT-16 | Connection banner covers chat header | UX_DELIGHT | NOT STARTED | P3 |
| ROOM-01 | Tap on My Room avatar wave chain never ran | UX_DELIGHT | DONE 9e5c5ea | P1 |
| ROOM-02 | Foot sliding / speed changes per segment | UX_DELIGHT | PARTIAL 7243477 (see MR-05, VIS-03) | P1 |
| ROOM-03 | Avatar ghosts toward back wall | UX_DELIGHT | DONE c5a6339 | P1 |
| ROOM-04 | Seated MiniRoom avatar squashed 14% | UX_DELIGHT | DONE c5a6339 | P1 |
| ROOM-05 | MiniRoom avatars always above furniture | UX_DELIGHT | NOT STARTED (= VIS-04) | P1 |
| ROOM-06 | MiniRoom left/top/zIndex animation | UX_DELIGHT | DONE c607202 | P1 |
| ROOM-07 | Partner presence/position not real | UX_DELIGHT, TASKS RT-01/02/03 | DONE 1a8f273, 9490eca | P1 |
| ROOM-08 | MiniRoom back arrow leaves without confirm | UX_DELIGHT | DONE 70a43cb | P1 |
| ROOM-09 | Inviter pulled into room on accept | UX_DELIGHT | DONE 048a489 ("door opening" moment still open, see SIG-01) | P1 |
| ROOM-10 | Editor drop settle and haptics | UX_DELIGHT | DONE b91a4cc | P1 |
| ROOM-11 | My Room avatar ground shadow | UX_DELIGHT | DONE (RoomRenderer2D.tsx:626; none when seated) | P2 |
| ROOM-12 | Editor zoom/undo jumps; parts appear/disappear abruptly | UX_DELIGHT | NOT STARTED | P2 |
| ROOM-13 | Inconsistent tap markers (old pink); pill not announced | UX_DELIGHT | NOT STARTED | P2 |
| ROOM-14 | English VoiceOver strings in room; locked tray card dead | UX_DELIGHT | PARTIAL 76b0aa4 (tray taps) | P2 |
| ROOM-15 | MiniRoom keyboard camera / bubble fade / history entrance | UX_DELIGHT | PARTIAL c607202 (camera; LayoutAnimation panel, bubbles, history open) | P2 |
| ROOM-16 | Room layers pop in one by one | UX_DELIGHT | NOT STARTED | P2 |
| ROOM-17 | 2 degree tilt after side walk; partner name in header | UX_DELIGHT | PARTIAL (HUD has partner name; tilt not verified) | P3 |
| SYS-01 | Wardrobe opens with fade, closes with slide | UX_DELIGHT | NOT STARTED (RootNavigator.tsx:793 options lack detailScreenOptions) | P1 |
| SYS-02 | Tab bar tap waits for 4 pages to re-render | UX_DELIGHT | NOT STARTED | P1 |
| SYS-03 | Unread/connection changes re-render root (PERF-1) | UX_DELIGHT, UX_MOTION PERF-1 | DONE 0a952e7 | P1 |
| SYS-04/05 | Sheet backdrop slides like a curtain; exit physics | UX_DELIGHT | PARTIAL e9a7047 (no consumer uses presentation="self", see ONBV-06) | P1 |
| SYS-06 | Bottom bar label/badge clip at large text; badge not read | UX_DELIGHT | PARTIAL 0e4647b (onboarding chrome only) | P1 |
| SYS-07 | Reduce Transparency only in Wardrobe; glass flash | UX_DELIGHT | DONE f34d52c | P1 |
| SYS-08 | Press feel inconsistent; single PressableScale (MQ-1) | UX_DELIGHT, UX_MOTION MQ-1 | PARTIAL 01e8889 (PressableScale used by shop card only) | P2 |
| SYS-09/10 | Halo rest size; shop blob loop (MQ-2, OPEN_UX #2) | UX_DELIGHT | DONE b5413a4 | P2 |
| SYS-11 | Daily reward toast English; toast app language (OPEN_UX #6) | UX_DELIGHT | DONE 27b29d9 | P2 |
| SYS-12 | Haptic map drift | UX_DELIGHT | PARTIAL cfea4f5 (map written), b91a4cc (editor) | P2 |
| SHOP-01 | Buy-the-look opens N alerts | UX_DELIGHT | DONE 61e235b | P1 |
| SHOP-02/04 | Shop tab re-tap; live shelf counter | UX_DELIGHT | DONE a54d389 | P2 |
| SHOP-03 | Product card press/selection motion | UX_DELIGHT | DONE 01e8889 | P2 |
| SHOP-05 | Shelf skeleton | UX_DELIGHT | DONE d97c4df | P2 |
| WRD-01 | Category change flash | UX_DELIGHT | DONE 9a9013a | P1 |
| WRD-02 | Thumbnails fade "late" | UX_DELIGHT | DONE (WardrobeCatalogCard.tsx:67 transition={0}) | P2 |
| WRD-03 | Section/category indicator, page dots | UX_DELIGHT | DONE 3b70e53 | P2 |
| WRD-04 | Invisible but paid glass blur | UX_DELIGHT | DONE ef018e1 | P2 |
| WRD-05 | Locked wardrobe items (OPEN_UX #1, MICRO-3); chevron | UX_DELIGHT, OPEN_UX | DONE 394aa25, 7ec258d | P2 |
| UXO-03 | Chat opening skeleton (LOAD-1 remainder) | OPEN_UX_WORK #3 | NOT STARTED (no skeleton in features/chat/thread) | P2 |
| UXO-04 | My Room tab re-tap scroll to top | OPEN_UX_WORK #4 | NOT STARTED | P3 |
| UXO-05 | Inbox refresh failure toast | OPEN_UX_WORK #5 | NOT STARTED | P3 |
| UXO-07 | Chat entrance may replay after offscreen | OPEN_UX_WORK #7 | NOT STARTED | P3 |
| UXO-09 | Safe QA backend to open MiniRoom in Simulator without hitting production | OPEN_UX_WORK | NEEDS OWNER DECISION | P1 |
| UXM-01 | PERF-2 freezeOnBlur for pager pages | UX_MOTION | NOT STARTED | P2 |
| UXM-02 | FONT-1 embed Inter (native build) | UX_MOTION | NOT STARTED (needs native build) | P2 |
| UXM-03 | SHEET-1 native form sheet; filter copy | UX_MOTION | NOT STARTED | P2 |
| UXM-04 | MICRO-4 Inbox back arrow removal | UX_MOTION | NEEDS OWNER DECISION | P3 |
| SIG-01 | Signature moments (chibi greeting on match, door-opening invite, outfit flies to avatar, bubble flight, liquid tab pill, scan-to-first-card) | UX_MOTION §6, UX_DELIGHT wave E | NOT STARTED | P2 |
| KBD-01 | react-native-keyboard-controller (native dep) | UX_DELIGHT, method:3 | NEEDS OWNER DECISION | P3 |
| PSH-01 | APNs key in EAS credentials (P-02) | TASKS P-02, REL-13 | NEEDS OWNER DECISION | P0 |
| PSH-02 | P-01 permission card, P-03 queue regardless of socket, P-04 chat exempt, P-05 safe errors | TASKS | DONE 911e075, 0cf68b3, 2310948, a3ed175 | P0 |
| PSH-03 | RT-04 speech bubble queue | TASKS | DONE 911e075 | P1 |
| PSH-04 | RT-10 end-to-end latency measurement (two phones, region) | TASKS | PARTIAL (dev-only diagnostics + local harness 574f84f, 7c90957) | P2 |
| PSH-05 | RT-07 Railway/Supabase region and pool size | TASKS | NEEDS OWNER DECISION | P2 |
| PSH-06 | Physical two-phone push test procedure | TASKS §1 | NEEDS NATIVE CHECK | P0 |
| STK-01 | Node 22.23.3 pin | research 1a | PARTIAL efca2d1 (eas.json still 22.22.2; Railway log check open) | P1 |
| STK-02 | Node 24 LTS before 2027-04-30 | research 1a, BACKEND_TECH_DECISION | NOT STARTED | P3 |
| STK-03 | TypeScript 6.0.3 in every workspace | runtime | DONE c90bc62 | P2 |
| STK-04 | uuid advisory exception expires 2026-11-30 | runtime | NEEDS OWNER DECISION | P2 |
| STK-05 | Supabase egress (5 GB/mo) weekly measurement; self pg_dump | research 5, BACKEND_TECH_DECISION | NEEDS OWNER DECISION | P1 |
| STK-06 | Expo push send batching (100/request); interruptionLevel passive for likes | research 8, method:2 | NOT STARTED (receipts already batched 12e73d4) | P3 |
| STK-07 | Railway overlap seconds; bufferutil; zod 4; TS 7; @types/node 24 vs Node 22; pino-pretty in prod deps | research 3,6,7, runtime | NOT STARTED (deferred by design) | P3 |
| NQA-T | T-1..T-9 phone checks of 30.09 fixes | OPEN_WORK §2.1 | NEEDS NATIVE CHECK | P1 |
| NQA-1 | 105-item native QA plan (24 P0) | OPEN_WORK, NATIVE_QA_WAVE | NEEDS NATIVE CHECK (all NOT RUN) | P0 |
| NQA-2..5 | Pager 11 checks, 29 promoted images, binary-commit log, ERR-05/DSC-04 | OPEN_WORK | NEEDS NATIVE CHECK | P1 |
| NQA-6 | Two-account E2E match -> chat -> invite -> room | OPEN_WORK | PARTIAL 2128e7c, a77b3c8 (automated over real HTTP/WS); native two-phone open | P0 |
| PRD-01..07 | ProfilePreview likes vs limit; local data on sign-out; two match screens; dev bundle id; 069 ban retention/OTP secret rotation; recycled numbers | OPEN_WORK §4 | NEEDS OWNER DECISION (PRD-4 DONE bae0ee7, needs deploy) | P2 |
| PERF-A | Device measurements (cold start, frame time, memory) | OPEN_WORK §5 | NEEDS NATIVE CHECK | P1 |
| PERF-C/D/E | Animated-avatar memory; EXPLAIN of Discover/chat; 1000-DAU load test | OPEN_WORK §5 | PARTIAL 574f84f (local harness, pg_stat_statements); no Railway/Supabase/device numbers | P2 |
| REL-01 | OTA file cap (~1221 files > 1000) | OPEN_WORK | NOT STARTED | P1 |
| REL-02 | develop -> main merge and Railway deploy (develop is 20 commits ahead of origin) | OPEN_WORK | NEEDS OWNER DECISION | P0 |
| REL-03 | 24 h log watch after deploy with old/new apps | OPEN_WORK | NOT STARTED | P1 |
| REL-05 | Separate staging environment and DB | OPEN_WORK | NEEDS OWNER DECISION | P1 |
| REL-08/09 | Signed archive review; App Store Connect forms | OPEN_WORK, APP_STORE_SUBMISSION_GATE | NOT STARTED | P0 |
| REL-10 | Apple 5.1.1(ix) / 1.2 classification | OPEN_WORK, APP_STORE_SUBMISSION_GATE | NEEDS OWNER DECISION | P0 |
| REL-11/12 | Legal pages 404; AASA/assetlinks 404 | OPEN_WORK | NOT STARTED | P0 |
| REL-13 | Real providers: APNs on two phones, SMS OTP cost, Firebase deletion | OPEN_WORK | NEEDS NATIVE CHECK | P0 |
| REL-15 | Maestro smoke test | OPEN_WORK | NEEDS NATIVE CHECK | P2 |
| REL-16 | RevenueCat sandbox purchase, product IDs | OPEN_WORK | NOT STARTED (before payments) | P2 |
| REL-17/18 | npm audit warnings; GitHub Actions Node 20 deprecation | OPEN_WORK | PARTIAL (audit:release passes with listed exceptions) | P3 |
| SEC-R1 | Access and refresh share one token | OPEN_WORK §7 | NOT STARTED | P2 |
| SEC-R3 | No security log for token reuse/revocation | OPEN_WORK §7 | NOT STARTED | P2 |
| SEC-R4 | Cross-replica revocation delay | OPEN_WORK §7 | DONE 421705c (revocations carried between instances) | P3 |
| SEC-R6 | Single broad DB role | OPEN_WORK §7 | NOT STARTED | P2 |
| SEC-R8 | Legacy admin key path still active | OPEN_WORK §7 | NOT STARTED | P2 |
| SEC-B/C | Untested attack paths; 400-before-401 on 3 routes | OPEN_WORK §7 | NOT STARTED | P2 |
| SEC-D | UGC moderation is a narrow phrase filter (Apple 1.2) | OPEN_WORK §7, APP_STORE_SUBMISSION_GATE | NOT STARTED | P1 |
| SEC-E | Realtime limits under load | OPEN_WORK §7 | PARTIAL 574f84f (local only) | P2 |
| SEC-F | Verify admin/analytics live | OPEN_WORK §7 | NOT STARTED | P3 |
| ART-01 | 13 required shoe thumbnails (Workbench export) | OPEN_WORK §8 | NOT STARTED (Mac) | P2 |
| ART-02..05 | Known accepted art defects; 25 retired items; test:workbench on Mac; evidence JSON | OPEN_WORK §8 | NEEDS OWNER DECISION | P3 |
| TD-01 | 14 oversized files allowlisted | OPEN_WORK §9 | PARTIAL (ProfileEditScreen 861 -> 758, RoomRenderer2D 996 -> 967) | P3 |
| TD-02 | JS frame loops allowlisted | OPEN_WORK §9 | PARTIAL (4 -> 1: useRoomEditorStageLayout) | P3 |
| TD-03..13 | Import edges, store shapes, E.164 dup, 244 .py scripts, roomV3/QA modules, LiveKit/legacy code, re-exports, build-profile vars, 239 KB catalog, native tests, Copy files | OPEN_WORK §9 | NOT STARTED | P3 |
| UX-01 | Color/font token migration (~700 literals) and screen-by-screen a11y | OPEN_WORK §3.4 | NOT STARTED | P2 |
| DOC-01 | BACKEND_REALTIME_PUSH_PROGRESS still says receipts unmerged (line 116) | find:merge#2 | NOT STARTED | P3 |
| DOC-02 | Failing art gates found by wiring orphan tests (coral wave, walk rig, etc.) | ENGINEERING_AUDIT | NEEDS OWNER DECISION | P3 |

Files:
- Working copy of the table: /tmp/claude-0/-home-user-blumi-app/edf6dc29-7eab-5d52-9037-d6f5d6ef66d4/scratchpad/inv.md
- Extracted journal findings: /tmp/claude-0/-home-user-blumi-app/edf6dc29-7eab-5d52-9037-d6f5d6ef66d4/scratchpad/findings.txt
- Extracted journal reports: /tmp/claude-0/-home-user-blumi-app/edf6dc29-7eab-5d52-9037-d6f5d6ef66d4/scratchpad/strres.txt
