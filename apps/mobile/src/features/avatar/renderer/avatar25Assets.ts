import { Asset } from "expo-asset"
import { File } from "expo-file-system"
import type { AvatarRigId } from "../model/avatarRoomContract"
import { ROOM_AVATAR_25D_TEXTURES } from "../rigs/girl/rigAssets"
import { ROOM_AVATAR_25D_ASTC_FILES, ROOM_AVATAR_25D_ASTC_MANIFEST } from "../rigs/girl/astc/astcAssets"
import {
  ROOM_AVATAR_25D_ASTC_FILES as ROOM_AVATAR_25D_MALE_ASTC_FILES,
  ROOM_AVATAR_25D_ASTC_MANIFEST as ROOM_AVATAR_25D_MALE_ASTC_MANIFEST
} from "../rigs/boy/astc/astcAssets"
import { ROOM_AVATAR_25D_TEXTURES as ROOM_AVATAR_25D_MALE_TEXTURES } from "../rigs/boy/rigAssets"
import type { Avatar25AstcManifest, Avatar25AstcSource } from "./avatar25Astc"
import type { Rig25 } from "./rigTypes"

/** The girl's exported rig (tools/avatar25d/export_rig.py → rigs/girl/). */
// A plain require keeps tsc from typing 2 MB of JSON.
export const AVATAR_GIRL_RIG = require("../rigs/girl/rig25.json") as Rig25
/** The boy's exported rig (export_rig.py --out …/rigs/boy; Workbench avatar25-v2/male/rig/rig_M3a_walk.json). */
export const AVATAR_BOY_RIG = require("../rigs/boy/rig25.json") as Rig25

function textureReader(textures: Record<string, number>) {
  return async (name: string): Promise<ArrayBuffer> => {
    const moduleId = textures[name]
    if (moduleId === undefined) throw new Error(`Unknown 2.5D avatar texture: ${name}`)
    const asset = Asset.fromModule(moduleId)
    await asset.downloadAsync()
    const uri = asset.localUri ?? asset.uri
    return new File(uri).arrayBuffer()
  }
}

export interface Avatar25RigAssets {
  id: AvatarRigId
  rig: Rig25
  readTextureBytes: (name: string) => Promise<ArrayBuffer>
  /** Derived ASTC 4x4 pages (<rig>/astc/, compress_pages.py); used where the GPU supports them (avatar25Astc). */
  astc: Avatar25AstcSource
}

function astcSource(manifest: unknown, files: Record<string, number>): Avatar25AstcSource {
  return { manifest: manifest as Avatar25AstcManifest, readBlob: textureReader(files) }
}

/** Both drawn bodies. Their page files share names (front_page0.png …): GPU caches key them by rig id. */
export const AVATAR_RIGS: Readonly<Record<AvatarRigId, Avatar25RigAssets>> = {
  female: {
    id: "female",
    rig: AVATAR_GIRL_RIG,
    readTextureBytes: textureReader(ROOM_AVATAR_25D_TEXTURES),
    astc: astcSource(ROOM_AVATAR_25D_ASTC_MANIFEST, ROOM_AVATAR_25D_ASTC_FILES)
  },
  male: {
    id: "male",
    rig: AVATAR_BOY_RIG,
    readTextureBytes: textureReader(ROOM_AVATAR_25D_MALE_TEXTURES),
    astc: astcSource(ROOM_AVATAR_25D_MALE_ASTC_MANIFEST, ROOM_AVATAR_25D_MALE_ASTC_FILES)
  }
}

/** The rig of each body, for pure code (the resolvers take rigs as input). */
export const AVATAR_RIG_DATA: Readonly<Record<AvatarRigId, Rig25>> = { female: AVATAR_GIRL_RIG, male: AVATAR_BOY_RIG }

export function getAvatar25Rig(id: AvatarRigId | undefined): Avatar25RigAssets {
  return AVATAR_RIGS[id ?? "female"]
}
