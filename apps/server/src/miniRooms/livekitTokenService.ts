import { createHmac } from "node:crypto"
import type { MediaSessionToken, MiniRoom } from "@blumi/contracts"

export interface LivekitTokenService {
  createMediaSession(input: {
    miniRoom: MiniRoom
    userId: string
    now?: Date
  }): MediaSessionToken
}

export interface CreateLivekitTokenServiceOptions {
  livekitUrl?: string
  apiKey?: string
  apiSecret?: string
}

export function createLivekitTokenService(
  options: CreateLivekitTokenServiceOptions = {}
): LivekitTokenService {
  return {
    createMediaSession({ miniRoom, userId, now = new Date() }) {
      const issuedAt = now.toISOString()
      if (!options.livekitUrl || !options.apiKey || !options.apiSecret) {
        return {
          miniRoomId: miniRoom.miniRoomId,
          livekitUrl: options.livekitUrl ?? "wss://demo.livekit.invalid",
          token: `demo-token-${miniRoom.miniRoomId}-${userId}`,
          issuedAt
        }
      }

      return {
        miniRoomId: miniRoom.miniRoomId,
        livekitUrl: options.livekitUrl,
        token: createLivekitJwt({
          apiKey: options.apiKey,
          apiSecret: options.apiSecret,
          roomName: miniRoom.livekitRoomName,
          userId,
          issuedAt: Math.floor(now.getTime() / 1000)
        }),
        issuedAt
      }
    }
  }
}

function createLivekitJwt(input: {
  apiKey: string
  apiSecret: string
  roomName: string
  userId: string
  issuedAt: number
}): string {
  const header = {
    alg: "HS256",
    typ: "JWT"
  }
  const payload = {
    iss: input.apiKey,
    sub: input.userId,
    iat: input.issuedAt,
    nbf: input.issuedAt,
    exp: input.issuedAt + 60 * 60,
    video: {
      roomJoin: true,
      room: input.roomName,
      canPublish: true,
      canPublishSources: ["microphone"],
      canSubscribe: true
    }
  }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signature = createHmac("sha256", input.apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url")
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url")
}
