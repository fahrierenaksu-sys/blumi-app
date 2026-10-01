# Etkileşim dalgası — durum kaydı (2026-10-01)

Kullanım hakkı azaldığı için ara kayıt. Dal: `integration/interaction-wave`
(bu dosyanın commit'i). Push edilmedi: `develop`/`main` yok, deploy yok,
migration 070 **uygulanmadı**.

## Birleştirilmiş ve test edilmiş (bu dalda)

- Oda hareket senkronu (sunucu doğrulaması, latest-wins kuyruğu, partner
  adımı kaybolma düzeltmeleri).
- Çift tik / görüldü: delivered + read cursor'ları, `chat.receipt_updated`,
  `chat.ack_delivered` silent lane. Migration 070 yazıldı, uygulanmadı
  (`docs/release/MIGRATION_070_RUNBOOK.md`); 070 olmadan alındı kapalı kalır.
- Bildirimler: tek uyarı defteri, açık sohbet/odada toast yok, davet push'u
  her zaman kuyruğa ve süreli, TR/EN sunucu metni, çıkışta token silme.
- Testler: sunucu 873 geçti / 0 hata / 126 atlandı; mobil gruplar,
  typecheck, lint temiz (`772846a`).

## Ajan dallarında, henüz birleştirilmedi

| Alan | Worktree dalı | Durum (kayıt anı) |
|---|---|---|
| Transport/gecikme/yük testi | `worktree-agent-a5fe0ab11d836e2f4` | 12 commit (event-driven yetki önbelleği, hızlı liveness, reconnect sonrası sohbet yenileme, DB pool ayarları, bağımlılık yamaları). 5000 kullanıcı bağlantısı 241 sn sürdü — incelenmeli. |
| Gelen kutusu/profil/oda editörü UI | `worktree-agent-ad63502eb5b59f5d8` | 1 commit (okunan sohbet okunmamış görünmesin) + devam |
| Backend teknoloji araştırması | `worktree-agent-ac9128e9f3c6a58c5` | devam |
| İstemci gecikmesi, E2E testleri, eşleşme hızı, oda koltuk/giriş-çıkış, "yazıyor…", push tamamlama, mağaza+gardırop, onboarding UI, DB sağlığı, asset denetimi | ilgili `worktree-agent-*` dalları | commit'lenmemiş iş var / devam |
| Workflow'lar | backend sağlamlaştırma ×3, karşı-denetim, onboarding performansı | devam |

Worktree'ler bu bulut konteynerinde; oturum kapanırsa commit'lenmemiş
iş kaybolur.

## Sonraki adımlar

1. Her ajan dalını `integration/interaction-wave`'e birleştir, çakışmaları
   kontrol et (kayıp değişiklik, çift tasarım, lane/ack mantığı).
2. typecheck, lint, sunucu + mobil testleri, gerçek PostgreSQL (`pgtest`).
3. Karşı-denetim bulgularını düzelt; yük testi sayılarını kaydet.
4. Sahip onayı ile: `develop`/`main` push, 070 (yedek + geri yükleme
   kanıtıyla), EAS APNs anahtarı kontrolü, iki telefonda native test.

## Doğrulanmış denetim bulguları (workflow'lar, düzeltilmedi)

Her bulgu ayrı ajanlarca doğrulandı; düzeltme aşaması kullanım limitinde kesildi.

- P0 db/workers: Push dispatch, Expo HTTP çağrısı boyunca 100'e kadar açık transaction tutuyor; 10'luk havuz tükeniyor (`notificationService.ts:212`).
- P0 db: Discovery snapshot'ları sınırsız büyüyor, Supabase Free 500 MB'ı aşabilir (`postgresDiscoverySnapshots.ts:45`).
- P1: Her kimlikli HTTP isteği işlemden önce 5–7 ardışık DB turu yapıyor (oturum 2–3 kez çözülüyor + rate-budget upsert) (`sharedRateBudgetHook.ts`).
- P1: Her realtime pong 4 turluk transaction; 5000 sokette havuz yetmiyor (`postgresPresenceRepository.ts:133`).
- P1: 30 sn yetki taraması soket başına 2 sorgu (`authService.ts:679`).
- P1: Outbox/push/audit tabloları hiç temizlenmiyor (depolama + gizlilik metni).
- P1: `/v1/discover` limiti doğrulanmamış token hash'ine bağlı; IP sınırı atlanabiliyor.
- P1: IP limitleri CGNAT/ortak ağda kullanıcıları cezalandırıyor; realtime ticket 30/dk/IP.
- P1: Production `BLUMI_TRUST_PROXY` zorunlu değil; Railway draining 0 sn (graceful shutdown çalışmıyor).
- P1: Discovery Watch döngüsü ilk adaysız izlemede bitiyor.
- P1 safety: Moderasyon kuyruğu yalnız en yeni 50–100 raporu gösteriyor; rapor/engel oluşturma sınırsız.
- P1 privacy/safety: Hesap silme açık raporları ve kanıtı siliyor; aynı telefonla temiz kayıt mümkün.
- P1 motion: Alıcı telefon partner hedefini kendi avatarına göre yeniden çözüyor; iki telefon farklı konum gösterebiliyor (`miniRoomSceneStore.ts:474`).
- P2: Kayıp `avatar_moved` yeniden senkronlanmıyor; aynı hesabın ikinci cihazı; bir partide 2. sohbetten sonraki delivery ack'ler düşüyor; statement/lock timeout yok; loglarda ham URL/IP; RevenueCat iade/eşleşmeyen olay; Firebase refresh token iptali; askı süresinin kısalması; ban kaldırma yolu yok.
