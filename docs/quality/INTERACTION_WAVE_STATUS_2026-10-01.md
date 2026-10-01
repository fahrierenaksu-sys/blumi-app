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
