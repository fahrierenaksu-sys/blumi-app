/**
 * Compatibility re-export. The tracker lives in `packages/realtime-client`;
 * import it from `@blumi/realtime-client`. Kept only for modules outside this
 * change's scope that still import this path (features/roomV2); do not add
 * new importers.
 */
export { createReconnectTransitionTracker } from "@blumi/realtime-client"
