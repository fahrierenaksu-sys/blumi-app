import type { SaveProductionAvatarResult } from "../avatarV2/avatarApi"
import type {
  AvatarCatalogItem,
  UserAvatar
} from "../avatarV2/avatarV2.types"
import type { SessionActor } from "./sessionModel"

export interface InitialProfileAvatarDependencies {
  catalog: AvatarCatalogItem[]
  fallbackAvatar: UserAvatar
  saveProductionAvatar: (input: {
    avatar: UserAvatar
    revision: number
    sessionToken: string
  }) => Promise<SaveProductionAvatarResult>
}

export async function persistUntouchedProfileStarterAvatar(
  actor: SessionActor,
  _dependencies: InitialProfileAvatarDependencies
): Promise<SessionActor> {
  // Identity and avatar body are separate product choices. Profile saves must
  // never infer or persist a body; AvatarSetup/Wardrobe own that decision.
  return actor
}
