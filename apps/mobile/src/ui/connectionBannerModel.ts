import type { RealtimeConnectionStatus } from "../features/realtime/realtimeClient"

export type ConnectionBannerState = "hidden" | "offline" | "reconnecting" | "unreachable"
export type ConnectionBannerLocale = "en" | "tr"

export function resolveConnectionBannerState(
  status: RealtimeConnectionStatus,
  isConnected: boolean,
  initialConnectionSlow = false
): ConnectionBannerState {
  if (!isConnected) return "offline"
  // Suppress only the transient first connection. A stuck connection must
  // still become visible after a short grace period.
  if (status === "connecting") return initialConnectionSlow ? "reconnecting" : "hidden"
  if (status === "idle" || status === "connected") return "hidden"
  // The fast attempts are exhausted and retries continue slowly: do not
  // promise an imminent reconnect.
  if (status === "unreachable") return "unreachable"
  return "reconnecting"
}

export interface ConnectionBannerCopy {
  offline: string
  connecting: string
  reconnecting: string
  unreachable: string
}

const CONNECTION_BANNER_COPY: Record<ConnectionBannerLocale, ConnectionBannerCopy> = {
  en: {
    offline: "No internet connection",
    connecting: "Connecting to Blumi…",
    reconnecting: "Reconnecting to Blumi…",
    unreachable: "Can't reach Blumi right now. We'll keep trying."
  },
  tr: {
    offline: "İnternet bağlantısı yok",
    connecting: "Blumi'ye bağlanılıyor…",
    reconnecting: "Blumi'ye yeniden bağlanılıyor…",
    unreachable: "Blumi'ye şu an ulaşılamıyor. Denemeye devam ediyoruz."
  }
}

export function getConnectionBannerCopy(locale: ConnectionBannerLocale): ConnectionBannerCopy {
  return CONNECTION_BANNER_COPY[locale]
}

/** Same Intl-based resolution the root navigator uses for chat copy. */
export function resolveConnectionBannerLocale(locale: string | undefined): ConnectionBannerLocale {
  return locale?.toLowerCase().startsWith("tr") ? "tr" : "en"
}
