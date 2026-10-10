import sharp from "sharp"
import type { AvatarStillRigId } from "@blumi/domain"

/**
 * The last level of the portrait fallback chain: one fixed head-and-shoulders bust per body, drawn from code so it
 * needs no art file. A valid portrait link then always shows a picture, even when the art pack is partial or
 * missing. It is a neutral silhouette on the person's colour, never a chibi, so it cannot pass for anyone's look.
 */
const INK = "#2B2B3A"
const INK_OPACITY = 0.34

/** Per body: the hair outline that tells the two busts apart (1 unit = 1/192 of the picture). */
const HAIR_SHAPES: Readonly<Record<AvatarStillRigId, string>> = {
  female: '<path d="M52 92 C48 44 76 30 96 30 C116 30 144 44 140 92 C132 78 122 66 96 64 C70 66 60 78 52 92 Z"/><ellipse cx="50" cy="98" rx="9" ry="22"/><ellipse cx="142" cy="98" rx="9" ry="22"/>',
  male: '<path d="M56 84 C54 46 76 34 96 34 C116 34 138 46 136 84 C128 70 118 62 96 62 C74 62 64 70 56 84 Z"/>'
}

function fallbackSvg(rig: AvatarStillRigId, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 192 192"><g fill="${INK}" opacity="${INK_OPACITY}"><ellipse cx="96" cy="206" rx="78" ry="62"/><rect x="84" y="118" width="24" height="30" rx="8"/><ellipse cx="96" cy="94" rx="36" ry="40"/>${HAIR_SHAPES[rig]}</g></svg>`
}

export async function drawFallbackPortrait(rig: AvatarStillRigId, background: string, size: number): Promise<Buffer> {
  const bust = await sharp(Buffer.from(fallbackSvg(rig, size))).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: bust, left: 0, top: 0 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer()
}
