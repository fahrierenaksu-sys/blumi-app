import type { AppLocale } from "../features/session/appLocale"

export function getErrorBoundaryCopy(locale: AppLocale, repeated = false) {
  return locale === "tr" ? {
    title: "Bir sorun oluştu",
    body: repeated
      ? "Sorun devam ediyor. Blumi'yi kapatıp yeniden aç. Kaydedilmemiş değişiklikleri yeniden girmen gerekebilir."
      : "Bu ekranı açamadık. Tekrar deneyebilirsin. Kaydedilmemiş değişiklikleri yeniden girmen gerekebilir.",
    retryLabel: "Tekrar dene",
    canRetry: !repeated
  } : {
    title: "Something went wrong",
    body: repeated
      ? "The problem is still happening. Please close and reopen Blumi. You may need to enter unsaved changes again."
      : "We couldn't open this screen. You can try again. You may need to enter unsaved changes again.",
    retryLabel: "Try again",
    canRetry: !repeated
  }
}
