# Blumi App Store listing and reviewer packet — draft

Status: **NOT SUBMITTED / NOT APPROVED** (draft prepared 2026-09-28). This copy describes the agreed first-release scope only. Confirm every sentence against the signed iPhone build before entering it in App Store Connect. Updated 2026-10-02: Apple Developer membership is active, and internal TestFlight builds exist (group `Blumi QA`). The support and privacy URLs serve 200 but are not yet entered in App Store Connect. Screenshots, reviewer access and App Store Connect entry remain open.

## Turkish product-page draft

- App adı: Blumi
- Alt başlık adayı: Eşleş, konuş, odanda buluş
- Açıklama:

  Blumi'de bir profil oluştur, ilgini çeken kişileri keşfet ve karşılıklı eşleştiğinde yazışmaya başla. Sohbet içinden bir oda daveti gönderebilir; davet kabul edilirse ortak odada yazılı sohbeti sürdürebilirsiniz. Avatarın ve odanla kendini ifade edebilirsin.

  Kontrol sende: kullanıcıları engelleyebilir, rahatsız edici davranışları bildirebilir ve hesabını uygulama içinden silebilirsin. Blumi 18 yaş ve üzeri içindir.

  İlk sürümde canlı ses, fotoğraf/video paylaşımı ve ücretli jeton satın alma yoktur.

- Destek URL'si: **OPEN** — `https://www.agentsworkerplus.online/blumi/support`; 2026-10-02'de HTTPS üzerinden 200 döndü. App Store Connect'e henüz girilmedi; destek kutusunun yanıt verdiği henüz kanıtlanmadı.
- Gizlilik URL'si: **OPEN** — `https://www.agentsworkerplus.online/blumi/legal/privacy`; 2026-10-02'de 200 döndü ve Blumi gizlilik metnini sundu. App Store Connect'e henüz girilmedi; insan hukuk incelemesi açık.
- Anahtar kelimeler, kategori, yaş derecesi ve ekran görüntüleri: **OPEN** — gerçek App Store Connect seçenekleri ve onaylı native ekranlar üzerinden sonlandırılacak.

## English product-page draft

- App name: Blumi
- Subtitle candidate: Match, chat, meet in your room
- Description:

  Create a profile, discover people and start a text conversation after a mutual match. Invite your match from chat to a shared room; once the invitation is accepted, continue the conversation there. Express yourself with your avatar and room.

  You can block users, report concerning behavior and initiate account deletion in the app. Blumi is for adults aged 18 and over.

  The first release does not offer live voice, photo or video sharing, or paid coin purchases.

## Review Notes working template

Do **not** paste a secret into this file. Fill the reviewer access fields privately in App Store Connect only after an end-to-end rehearsal.

1. Blumi is an 18+ social app. The path is mutual match → text chat → optional chat-initiated room invitation → shared text room. It does not support random chat, live voice, media sharing or paid coin purchases in this version.
2. Sign-in uses phone verification. **OPEN:** provide Apple Review a working access path and, if needed, two controlled adult accounts that can demonstrate a mutual match. Record phone numbers/test OTP instructions only in the protected App Store Connect review fields, not in source control. Keep the review backend and accounts active during review.
3. Report and block controls are available from profiles, chat and rooms. Account deletion is in Settings and requires a one-time confirmation code. **OPEN:** rehearse both flows on the exact submitted build and explain any special steps.
4. **OPEN:** identify the signed build, backend deployment, support/privacy URLs, tested iPhone models and any non-obvious navigation steps. Do not claim a test succeeded until recorded evidence exists.

Source: [Apple App Review Guidelines: access, live backend and truthful metadata](https://developer.apple.com/app-store/review/guidelines/); [App Store Connect version metadata](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information).
