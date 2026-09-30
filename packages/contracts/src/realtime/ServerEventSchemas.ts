import { z } from "zod";
import {
  isAcceptedAvatarLoadout,
  type AvatarLoadout,
  type AvatarSelection,
} from "../avatar/AvatarSelection";
import {
  chatMessageListSchema,
  chatMessageReceivedSchema,
  chatThreadListSchema,
  chatThreadReadSchema,
  chatThreadSchema,
} from "../chat/ChatThreadSchemas";
import { CONNECTION_DECISION_STATUSES } from "../connections/ConnectionDecision";
import { sharedRoomDecorSnapshotSchema } from "../miniRooms/MiniRoom";
import { MINI_ROOM_INVITE_DECISIONS } from "../miniRooms/MiniRoomInviteDecision";
import { MINI_ROOM_INVITE_STATUSES } from "../miniRooms/MiniRoomInvite";
import { REACTION_TYPES } from "../reactions/ReactionEvent";
import { ROOM_SPOT_KINDS } from "../rooms/RoomSpot";
import type { RealtimeErrorCode, ServerEvent } from "./ServerEvents";

/**
 * Runtime validation for inbound realtime server events.
 *
 * Payload schemas mirror the TypeScript contracts in `ServerEvents.ts`. They
 * are intentionally non-strict on objects (additive server fields are
 * tolerated) and chat payloads reuse the shared chat HTTP schemas so one
 * message/thread shape is enforced on both transports.
 */

type PayloadOf<Type extends ServerEvent["type"]> = Extract<
  ServerEvent,
  { type: Type }
>["payload"];

const id = z.string().min(1);
const timestamp = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected a date.");
const finiteNumber = z.number().finite();

const avatarLoadoutSchema = z.custom<AvatarLoadout>(
  (value) => isAcceptedAvatarLoadout(value),
  "Expected an accepted avatar loadout.",
);

const avatarSelectionSchema: z.ZodType<AvatarSelection, z.ZodTypeDef, unknown> =
  z.object({
    presetId: id,
    loadout: avatarLoadoutSchema.optional(),
    revision: z.number().int().nonnegative().optional(),
  });

const participantPairSchema = z.tuple([id, id]);

const roomSpotSchema = z.object({
  spotId: id,
  kind: z.enum(ROOM_SPOT_KINDS),
  x: finiteNumber,
  y: finiteNumber,
  label: z.string().optional(),
});

const presenceUserSchema = z.object({
  userId: id,
  displayName: z.string(),
  avatar: avatarSelectionSchema,
  spotId: id,
  inMiniRoom: z.boolean(),
});

const roomPresenceSnapshotSchema = z.object({
  roomId: id,
  users: z.array(presenceUserSchema),
  updatedAt: timestamp,
});

const miniRoomInviteShape = {
  inviteId: id,
  roomId: id.optional(),
  senderUserId: id,
  recipientUserId: id,
  senderSpotId: id.optional(),
  sourceThreadId: id.optional(),
  createdAt: timestamp,
  expiresAt: timestamp.optional(),
  roomSessionId: id.optional(),
};

const miniRoomParticipantSchema = z.object({
  userId: id,
  displayName: z.string(),
  avatar: avatarSelectionSchema,
});

const realtimeErrorCodes = [
  "PRESENCE_ROOM_UNAVAILABLE",
  "CHAT_MESSAGE_NOT_SENT",
] as const satisfies readonly RealtimeErrorCode[];

export const serverEventPayloadSchemas = {
  "room.joined": z.object({
    roomId: id,
    currentUserId: id,
    assignedSpotId: id,
    layout: z.object({
      roomId: id,
      spots: z.array(roomSpotSchema),
      proximityRadius: finiteNumber,
    }),
    snapshot: roomPresenceSnapshotSchema,
  }) satisfies z.ZodType<PayloadOf<"room.joined">, z.ZodTypeDef, unknown>,
  "room.left": z.object({
    roomId: id,
  }) satisfies z.ZodType<PayloadOf<"room.left">, z.ZodTypeDef, unknown>,
  "presence.snapshot":
    roomPresenceSnapshotSchema satisfies z.ZodType<PayloadOf<"presence.snapshot">, z.ZodTypeDef, unknown>,
  "presence.nearby": z.object({
    roomId: id,
    userId: id,
    nearbyUsers: z.array(
      z.object({
        userId: id,
        spotId: id,
        distance: finiteNumber,
        canInvite: z.boolean(),
        blocked: z.boolean(),
      }),
    ),
  }) satisfies z.ZodType<PayloadOf<"presence.nearby">, z.ZodTypeDef, unknown>,
  "mini_room.invite_received": z.object(
    miniRoomInviteShape,
  ) satisfies z.ZodType<PayloadOf<"mini_room.invite_received">, z.ZodTypeDef, unknown>,
  "mini_room.invite_decided": z.object({
    inviteId: id,
    senderUserId: id,
    recipientUserId: id,
    status: z.enum(MINI_ROOM_INVITE_DECISIONS),
    decidedAt: timestamp,
  }) satisfies z.ZodType<PayloadOf<"mini_room.invite_decided">, z.ZodTypeDef, unknown>,
  "chat.room_invite_updated": z.object({
    ...miniRoomInviteShape,
    status: z.enum(MINI_ROOM_INVITE_STATUSES),
    decidedAt: timestamp.optional(),
  }) satisfies z.ZodType<PayloadOf<"chat.room_invite_updated">, z.ZodTypeDef, unknown>,
  "mini_room.ready": z.object({
    miniRoom: z.object({
      miniRoomId: id,
      lobbyRoomId: id,
      sourceThreadId: id.optional(),
      participantUserIds: participantPairSchema,
      livekitRoomName: id,
      sharedDecor: sharedRoomDecorSnapshotSchema.optional(),
    }),
    mediaSession: z.object({
      miniRoomId: id,
      livekitUrl: id,
      token: id,
      issuedAt: timestamp,
    }),
    participants: z.tuple([miniRoomParticipantSchema, miniRoomParticipantSchema]),
  }) satisfies z.ZodType<PayloadOf<"mini_room.ready">, z.ZodTypeDef, unknown>,
  "mini_room.ended": z.object({
    miniRoomId: id,
    lobbyRoomId: id,
    participantUserIds: participantPairSchema,
    endedByUserId: id,
    endedAt: timestamp,
  }) satisfies z.ZodType<PayloadOf<"mini_room.ended">, z.ZodTypeDef, unknown>,
  "connection.decision_recorded": z.object({
    miniRoomId: id,
    actorUserId: id,
    partnerUserId: id,
    status: z.enum(CONNECTION_DECISION_STATUSES),
    decidedAt: timestamp,
  }) satisfies z.ZodType<PayloadOf<"connection.decision_recorded">, z.ZodTypeDef, unknown>,
  "connection.matched": z.object({
    miniRoomId: id,
    participantUserIds: participantPairSchema,
    matchedAt: timestamp,
  }) satisfies z.ZodType<PayloadOf<"connection.matched">, z.ZodTypeDef, unknown>,
  "chat.thread_created":
    chatThreadSchema satisfies z.ZodType<PayloadOf<"chat.thread_created">, z.ZodTypeDef, unknown>,
  "chat.thread_listed":
    chatThreadListSchema satisfies z.ZodType<PayloadOf<"chat.thread_listed">, z.ZodTypeDef, unknown>,
  "chat.thread_read":
    chatThreadReadSchema satisfies z.ZodType<PayloadOf<"chat.thread_read">, z.ZodTypeDef, unknown>,
  "chat.message_listed":
    chatMessageListSchema satisfies z.ZodType<PayloadOf<"chat.message_listed">, z.ZodTypeDef, unknown>,
  "chat.message_received":
    chatMessageReceivedSchema satisfies z.ZodType<PayloadOf<"chat.message_received">, z.ZodTypeDef, unknown>,
  "reaction.received": z.object({
    roomId: id,
    actorUserId: id,
    targetUserId: id.optional(),
    reaction: z.enum(REACTION_TYPES),
    createdAt: timestamp,
  }) satisfies z.ZodType<PayloadOf<"reaction.received">, z.ZodTypeDef, unknown>,
  "safety.user_blocked": z.object({
    blockedUserId: id,
  }) satisfies z.ZodType<PayloadOf<"safety.user_blocked">, z.ZodTypeDef, unknown>,
  "realtime.error": z.object({
    code: z.enum(realtimeErrorCodes),
    requestType: id,
    message: z.string(),
    clientMessageId: z.string().min(1).max(128).optional(),
  }) satisfies z.ZodType<PayloadOf<"realtime.error">, z.ZodTypeDef, unknown>,
} as const satisfies { [Type in ServerEvent["type"]]: z.ZodTypeAny };

export type ServerEventType = ServerEvent["type"];

export const SERVER_EVENT_TYPES = Object.freeze(
  Object.keys(serverEventPayloadSchemas) as ServerEventType[],
);

export function isKnownServerEventType(type: string): type is ServerEventType {
  return Object.prototype.hasOwnProperty.call(serverEventPayloadSchemas, type);
}

const serverEventEnvelopeSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown(),
});

/**
 * Result of validating one inbound message. `invalid` and `unknown` results
 * never carry payload data, so callers can log them without leaking PII.
 */
export type ServerEventParseResult =
  | { kind: "valid"; event: ServerEvent }
  | { kind: "unknown"; type: string }
  | {
      kind: "invalid";
      type: ServerEventType | null;
      /** Dotted payload paths that failed validation; field names only. */
      issuePaths: string[];
    };

/**
 * Validate an already JSON-decoded realtime message.
 *
 * - Known type with a conforming payload: `valid`. The returned event is the
 *   original decoded object (validation never rewrites or strips fields).
 * - Well-formed envelope with an event type this build does not know
 *   (a newer server): `unknown`, to be ignored for forward compatibility.
 * - Anything else: `invalid`.
 */
export function parseServerEvent(value: unknown): ServerEventParseResult {
  const envelope = serverEventEnvelopeSchema.safeParse(value);
  if (!envelope.success || !("payload" in (value as object))) {
    return { kind: "invalid", type: null, issuePaths: [] };
  }
  const { type } = envelope.data;
  if (!isKnownServerEventType(type)) {
    return { kind: "unknown", type };
  }
  const payload = serverEventPayloadSchemas[type].safeParse(envelope.data.payload);
  if (!payload.success) {
    return {
      kind: "invalid",
      type,
      issuePaths: [
        ...new Set(payload.error.issues.map((issue) => issue.path.join("."))),
      ],
    };
  }
  return { kind: "valid", event: value as ServerEvent };
}
