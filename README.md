# Blumi

Blumi'nin Expo SDK 57 mobil uygulamasını, API/realtime sunucusunu ve paylaşılan iş kurallarını içeren bağımsız monorepo.

## Gereksinimler

- Node.js 22.22.2 (`nvm use`)
- npm 10+
- iOS geliştirme için Xcode ve CocoaPods

## Kurulum

```bash
npm ci
cp .env.example .env.local
```

Kurulumun tek otoritesi kökteki npm workspace ve package-lock.json dosyasıdır; alt workspace içinde ayrı lockfile üretilmez. Kurulum sonrası sürüme bağlı navigation uyumluluk yaması otomatik uygulanır: query-string 9 ile düzeltilmiş decode-uri-component kullanılır; upstream namespace importları default importa uyarlanır. Yama ve gerçek deep-link regresyonu verify kapısındadır.

`npm run verify` native build almadan kaynak kontrollerini ve zorunlu, izole PostgreSQL kapısını çalıştırır. PostgreSQL araçları (`initdb`, `pg_ctl`) PATH içinde bulunmalıdır. Kapı kendi geçici, yalnız yerel Unix soketinden erişilen cluster'ını oluşturur; mevcut DATABASE_URL kullanılmaz. Araç/DB eksikliği veya atlanan test başarılı sayılmaz. Test cluster'ı durdurulur ve üretilen veriler silinir; inceleme logları bırakılır. Yalnız bilinçli teşhis için `BLUMI_PG_KEEP_TEST_DATA=1` veriyi korur.

Production legal önkoşulları EAS kurulum sonrası, native hazırlıktan önce kontrol edilir; preview kontrolü gerçek legal yayın kanıtının yerine geçmez. Oluşturulmuş Xcode dosyalarının cihaz doğrulaması kaynak testlerinden ayrıdır.

Yerel sunucu varsayılan olarak bellek deposu ve geliştirme sağlayıcılarıyla çalışır; gerçek secret'ları yalnız ignore edilen env dosyalarında veya deployment secret yöneticisinde tutun.

## Çalıştırma

Expo Go (telefon testi için varsayılan):

```bash
npm start
```

Bu komut Metro'yu her zaman `apps/mobile` projesinden, LAN'da `8081` portundan başlatır. Temiz Metro önbelleği gerektiğinde `npm --workspace @blumi/mobile run start:clear` kullanılır.

API ve realtime sunucusu ayrı terminalde çalıştırılır:

```bash
npm run dev:server
```

iOS development build gerektiğinde:

```bash
npm --workspace @blumi/mobile run start:dev-client
```

Native iOS build:

```bash
cd apps/mobile
SENTRY_DISABLE_AUTO_UPLOAD=true npm run ios
```

## Doğrulama

```bash
npm run verify
```

Android native doğrulaması bu SDK 57 geçiş fazının kapsamında değildir.
