import type { AppLocale } from "../../session/appLocale"
import type { ConnectionBannerState } from "./connectionBannerModel"

type VisibleConnectionBannerState = Exclude<ConnectionBannerState, "hidden">

const CONNECTION_BANNER_COPY: Record<AppLocale, Record<VisibleConnectionBannerState, string>> = {
  en: {
    reconnecting: "Connecting…",
    offline: "No internet connection",
    unreachable: "Can't reach Blumi. Still trying…"
  },
  tr: {
    reconnecting: "Bağlanıyor…",
    offline: "İnternet bağlantısı yok",
    unreachable: "Blumi'ye ulaşılamıyor. Denemeye devam ediyoruz…"
  }
}

export function getConnectionBannerLabel(
  state: ConnectionBannerState,
  locale: AppLocale
): string {
  return state === "hidden" ? "" : CONNECTION_BANNER_COPY[locale][state]
}
