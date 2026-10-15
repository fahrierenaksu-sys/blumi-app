/** The part of a NetInfo state the app reads; kept free of native imports. */
export interface NetworkLinkState {
  isConnected: boolean | null
  isInternetReachable?: boolean | null
}

/**
 * Whether the device has a network link. Only a link that is down counts as
 * offline. NetInfo's `isInternetReachable` comes from its own probe of a
 * third-party URL, which fails or times out while Blumi's API answers (seen
 * on the Simulator and on networks that block that host), and it used to put
 * the whole app into "no internet" with read-only shop actions. Whether the
 * Blumi server itself answers is reported by the realtime connection status
 * ("reconnecting" / "unreachable"), so nothing is lost by ignoring the probe.
 */
export function isNetworkLinkConnected(state: NetworkLinkState): boolean {
  return state.isConnected !== false
}
