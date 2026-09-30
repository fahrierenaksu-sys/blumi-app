/**
 * Compatibility re-export. The realtime client lives in
 * `packages/realtime-client`; import it from `@blumi/realtime-client`.
 * Kept only for modules outside this change's scope that still import this
 * path (features/roomV2); do not add new importers.
 */
export type {
  RealtimeConnectionMeta,
  RealtimeConnectionStatus
} from "@blumi/realtime-client"
