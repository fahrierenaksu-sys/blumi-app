import { randomBytes } from "node:crypto"
import type { AvatarLoadout } from "@blumi/contracts"
import {
  createAvatarPortraitRenderer,
  loadBundledAvatarPortraitLayers,
  type AvatarPortrait,
  type AvatarPortraitRenderer
} from "../avatar/avatarPortrait"
import {
  createNotificationPortraitLinks,
  type NotificationPortraitLinks
} from "./notificationPortraitLinks"

/** Sender pictures for pushes: a link when a push is sent, the image when a phone fetches it. */
export interface NotificationPortraitService {
  /** Undefined when pictures are off (no public origin, no bundled layers) or the loadout cannot be drawn. */
  urlFor(sender: { userId: string; loadout: AvatarLoadout }, now: Date): string | undefined
  /** Null for an invalid or expired token. */
  render(token: string, now: Date): Promise<AvatarPortrait | null>
}

export function createNotificationPortraitService(options: {
  secret?: string
  publicOrigin?: string
  renderer?: AvatarPortraitRenderer | null
  links?: NotificationPortraitLinks
}): NotificationPortraitService {
  const renderer = options.renderer === undefined
    ? createDefaultRenderer()
    : options.renderer
  const links = options.links ?? createNotificationPortraitLinks({
    // Without a configured secret (local development) links last one process.
    secret: options.secret ?? randomBytes(32).toString("base64url"),
    publicOrigin: options.publicOrigin
  })
  return {
    urlFor(sender, now) {
      if (!renderer) return undefined
      try {
        return links.createUrl({ loadout: sender.loadout, background: renderer.backgroundFor(sender.userId) }, now)
      } catch {
        return undefined
      }
    },
    async render(token, now) {
      if (!renderer) return null
      const content = links.open(token, now)
      if (!content) return null
      try {
        return await renderer.render(content)
      } catch {
        // An item whose art is missing from this build: the push simply has no picture.
        return null
      }
    }
  }
}

function createDefaultRenderer(): AvatarPortraitRenderer | null {
  const layers = loadBundledAvatarPortraitLayers()
  return layers ? createAvatarPortraitRenderer({ layers }) : null
}
