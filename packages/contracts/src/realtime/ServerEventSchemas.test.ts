import assert from "node:assert/strict";
import test from "node:test";
import {
  SERVER_EVENT_TYPES,
  parseServerEvent,
  type ServerEventType,
} from "./ServerEventSchemas";

const NOW = "2026-09-30T12:00:00.000Z";
const LATER = "2026-09-30T12:00:01.000Z";

const AVATAR = {
  presetId: "avatar_v2_body_male_light",
  revision: 3,
  loadout: {
    schemaVersion: 2 as const,
    bodyId: "avatar_v2_body_male_light",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    dressId: null,
    outerwearId: null,
    accessoryIds: [],
  },
};

const MESSAGE = {
  messageId: "message-1",
  threadId: "thread-1",
  senderUserId: "ada",
  body: "hello",
  sentAt: NOW,
};

const THREAD = {
  threadId: "thread-1",
  miniRoomId: "room-1",
  participantUserIds: ["ada", "bora"],
  participants: [
    { userId: "ada", displayName: "Ada", avatar: AVATAR },
    { userId: "bora" },
  ],
  createdAt: NOW,
  lastMessage: MESSAGE,
  unreadCount: 1,
};

const SNAPSHOT = {
  roomId: "lobby",
  users: [{
    userId: "ada",
    displayName: "Ada",
    avatar: { presetId: "dusk" },
    spotId: "spot-1",
    inMiniRoom: false,
  }],
  updatedAt: NOW,
};

const INVITE = {
  inviteId: "invite-1",
  senderUserId: "ada",
  recipientUserId: "bora",
  sourceThreadId: "thread-1",
  createdAt: NOW,
  expiresAt: LATER,
};

/**
 * One conforming event and one non-conforming payload per server event type.
 * The invalid payloads break a field a consumer relies on.
 */
const FIXTURES: Record<ServerEventType, { valid: unknown; invalid: unknown }> = {
  "mini_room.motion_snapshot": {
    valid: { miniRoomId: "room", epoch: "e", participantUserIds: ["a", "b"], avatars: [
      { userId: "a", x: .38, y: .76, present: true, revision: 1 },
      { userId: "b", x: .62, y: .76, present: false, revision: 0 }] },
    invalid: { miniRoomId: "room", epoch: "e", participantUserIds: ["a", "b"], avatars: [] }
  },
  "mini_room.avatar_moved": {
    valid: { miniRoomId: "room", epoch: "e", participantUserIds: ["a", "b"],
      avatar: { userId: "a", x: .5, y: .7, present: true, revision: 2 } },
    invalid: { miniRoomId: "room", epoch: "e", participantUserIds: ["a", "b"],
      avatar: { userId: "a", x: 2, y: .7, present: true, revision: 2 } }
  },
  "mini_room.scene_superseded": {
    valid: { miniRoomId: "room" },
    invalid: { miniRoomId: "" }
  },
  "room.joined": {
    valid: {
      roomId: "lobby",
      currentUserId: "ada",
      assignedSpotId: "spot-1",
      layout: {
        roomId: "lobby",
        spots: [{ spotId: "spot-1", kind: "seat", x: 0.5, y: 0.25 }],
        proximityRadius: 2,
      },
      snapshot: SNAPSHOT,
    },
    invalid: { roomId: "lobby", currentUserId: "ada", assignedSpotId: "spot-1" },
  },
  "room.left": { valid: { roomId: "lobby" }, invalid: { roomId: 7 } },
  "presence.snapshot": {
    valid: SNAPSHOT,
    invalid: { ...SNAPSHOT, users: [{ userId: "ada" }] },
  },
  "presence.nearby": {
    valid: {
      roomId: "lobby",
      userId: "ada",
      nearbyUsers: [{ userId: "bora", spotId: "spot-2", distance: 1.5, canInvite: true, blocked: false }],
    },
    invalid: { roomId: "lobby", userId: "ada", nearbyUsers: [{ userId: "bora", distance: "near" }] },
  },
  "mini_room.invite_received": {
    valid: { ...INVITE, roomId: "lobby", senderSpotId: "spot-1" },
    invalid: { ...INVITE, senderUserId: "" },
  },
  "mini_room.invite_decided": {
    valid: { inviteId: "invite-1", senderUserId: "ada", recipientUserId: "bora", status: "accepted", decidedAt: NOW },
    invalid: { inviteId: "invite-1", senderUserId: "ada", recipientUserId: "bora", status: "maybe", decidedAt: NOW },
  },
  "chat.room_invite_updated": {
    valid: { ...INVITE, status: "accepted", decidedAt: LATER, roomSessionId: "room-1" },
    invalid: { ...INVITE, status: "unknown-status" },
  },
  "mini_room.ready": {
    valid: {
      miniRoom: {
        miniRoomId: "room-1",
        lobbyRoomId: "lobby",
        sourceThreadId: "thread-1",
        participantUserIds: ["ada", "bora"],
        livekitRoomName: "livekit-room-1",
        startedAt: NOW,
      },
      mediaSession: {
        miniRoomId: "room-1",
        livekitUrl: "wss://livekit.example",
        token: "media-token",
        issuedAt: NOW,
      },
      participants: [
        { userId: "ada", displayName: "Ada", avatar: AVATAR },
        { userId: "bora", displayName: "Bora", avatar: { presetId: "dusk" } },
      ],
    },
    invalid: {
      miniRoom: {
        miniRoomId: "room-1",
        lobbyRoomId: "lobby",
        participantUserIds: ["ada"],
        livekitRoomName: "livekit-room-1",
      },
      mediaSession: { miniRoomId: "room-1", livekitUrl: "wss://livekit.example", token: "t", issuedAt: NOW },
      participants: [],
    },
  },
  "mini_room.ended": {
    valid: {
      miniRoomId: "room-1",
      lobbyRoomId: "lobby",
      participantUserIds: ["ada", "bora"],
      endedByUserId: "ada",
      endedAt: NOW,
    },
    invalid: {
      miniRoomId: "room-1",
      lobbyRoomId: "lobby",
      participantUserIds: ["ada", "bora"],
      endedByUserId: "ada",
      endedAt: "not a date",
    },
  },
  "connection.decision_recorded": {
    valid: { miniRoomId: "room-1", actorUserId: "ada", partnerUserId: "bora", status: "saved", decidedAt: NOW },
    invalid: { miniRoomId: "room-1", actorUserId: "ada", partnerUserId: "bora", status: "liked", decidedAt: NOW },
  },
  "connection.matched": {
    valid: { miniRoomId: "room-1", participantUserIds: ["ada", "bora"], matchedAt: NOW },
    invalid: { miniRoomId: "room-1", participantUserIds: ["ada", "bora", "cem"], matchedAt: NOW },
  },
  "chat.thread_created": {
    valid: THREAD,
    invalid: { ...THREAD, participantUserIds: ["ada"] },
  },
  "chat.thread_listed": {
    valid: { userId: "ada", threads: [THREAD], nextCursor: null },
    invalid: { userId: "ada", threads: "none" },
  },
  "chat.thread_read": {
    valid: { userId: "ada", threadId: "thread-1", readAt: NOW },
    invalid: { userId: "ada", threadId: "thread-1" },
  },
  "chat.message_listed": {
    valid: { userId: "ada", threadId: "thread-1", messages: [MESSAGE] },
    invalid: { userId: "ada", threadId: "thread-1", messages: [{ ...MESSAGE, body: "" }] },
  },
  "chat.message_received": {
    valid: MESSAGE,
    invalid: { ...MESSAGE, readAt: "2026-09-30T11:00:00.000Z" },
  },
  "chat.receipt_updated": {
    valid: {
      threadId: "thread-1",
      userId: "bora",
      participantUserIds: ["ada", "bora"],
      deliveredUpTo: { sentAt: NOW, messageId: "message-1" },
    },
    invalid: {
      threadId: "thread-1",
      userId: "bora",
      participantUserIds: ["ada", "bora"],
      readUpTo: { sentAt: "soon", messageId: "message-1" },
    },
  },
  "chat.typing_updated": {
    valid: { threadId: "thread-1", userId: "bora", state: "start", expiresInMs: 6000 },
    invalid: { threadId: "thread-1", userId: "bora", state: "typing", expiresInMs: 6000 },
  },
  "reaction.received": {
    valid: { roomId: "lobby", actorUserId: "ada", targetUserId: "bora", reaction: "wave", createdAt: NOW },
    invalid: { roomId: "lobby", actorUserId: "ada", reaction: "kiss", createdAt: NOW },
  },
  "safety.user_blocked": {
    valid: { blockedUserId: "bora" },
    invalid: { blockedUserId: null },
  },
  "realtime.error": {
    valid: {
      code: "PRESENCE_ROOM_UNAVAILABLE",
      requestType: "room.join",
      message: "The shared lobby is no longer available.",
    },
    invalid: { code: "PRESENCE_ROOM_UNAVAILABLE", message: "missing request type" },
  },
  "realtime.heartbeat": {
    valid: { intervalMs: 15_000 },
    invalid: { intervalMs: 5 },
  },
};

test("fixtures cover every server event type in the contract", () => {
  assert.deepEqual(Object.keys(FIXTURES).sort(), [...SERVER_EVENT_TYPES].sort());
  assert.equal(SERVER_EVENT_TYPES.length, 25);
});

test("a typing update names the typist, a known state and a bounded lifetime, never text", () => {
  const base = { threadId: "thread-1", userId: "bora" };
  const parse = (payload: unknown) => parseServerEvent({ type: "chat.typing_updated", payload }).kind;
  assert.equal(parse({ ...base, state: "start", expiresInMs: 6000 }), "valid");
  assert.equal(parse({ ...base, state: "stop", expiresInMs: 0 }), "valid");
  // A start must lapse on its own; a stuck indicator is worse than none.
  assert.equal(parse({ ...base, state: "start", expiresInMs: 0 }), "invalid");
  assert.equal(parse({ ...base, state: "start", expiresInMs: 15_001 }), "invalid");
  assert.equal(parse({ ...base, state: "start", expiresInMs: 1.5 }), "invalid");
  assert.equal(parse({ ...base, state: "start" }), "invalid");
  assert.equal(parse({ threadId: "thread-1", state: "stop", expiresInMs: 0 }), "invalid");
  assert.equal(parse({ ...base, userId: "", state: "stop", expiresInMs: 0 }), "invalid");
});

test("a receipt update names one of two distinct participants and moves a cursor", () => {
  const base = { threadId: "thread-1", userId: "bora", participantUserIds: ["ada", "bora"] };
  const cursor = { sentAt: NOW, messageId: "message-1" };
  assert.equal(parseServerEvent({ type: "chat.receipt_updated", payload: { ...base, readUpTo: cursor } }).kind, "valid");
  // A cursor without a message id covers everything sent at or before sentAt.
  assert.equal(parseServerEvent({ type: "chat.receipt_updated", payload: { ...base, readUpTo: { sentAt: NOW } } }).kind, "valid");
  assert.equal(parseServerEvent({ type: "chat.receipt_updated", payload: base }).kind, "invalid");
  assert.equal(parseServerEvent({
    type: "chat.receipt_updated",
    payload: { ...base, userId: "cem", deliveredUpTo: cursor },
  }).kind, "invalid");
  assert.equal(parseServerEvent({
    type: "chat.receipt_updated",
    payload: { ...base, userId: "ada", participantUserIds: ["ada", "ada"], deliveredUpTo: cursor },
  }).kind, "invalid");
  assert.equal(parseServerEvent({
    type: "chat.receipt_updated",
    payload: { ...base, deliveredUpTo: { sentAt: NOW, messageId: "" } },
  }).kind, "invalid");
});

test("a motion record may name a refused seat; older records without it stay valid", () => {
  const base = { miniRoomId: "room", epoch: "e", participantUserIds: ["a", "b"] };
  const refused = { userId: "b", x: .5, y: .57, present: true, revision: 3, deniedHotspotId: "chair:seat" };
  const moved = parseServerEvent({ type: "mini_room.avatar_moved", payload: { ...base, avatar: refused } });
  assert.equal(moved.kind, "valid");
  assert.equal(moved.kind === "valid" && moved.event.type === "mini_room.avatar_moved"
    ? moved.event.payload.avatar.deniedHotspotId : undefined, "chair:seat");
  assert.equal(parseServerEvent({ type: "mini_room.avatar_moved",
    payload: { ...base, avatar: { ...refused, deniedHotspotId: "" } } }).kind, "invalid");
});

test("thread and message lists from a server without receipts stay valid", () => {
  assert.equal(parseServerEvent({ type: "chat.thread_listed", payload: { userId: "ada", threads: [THREAD] } }).kind, "valid");
  assert.equal(parseServerEvent({
    type: "chat.message_listed",
    payload: {
      userId: "ada",
      threadId: "thread-1",
      messages: [MESSAGE],
      partnerReceipts: { deliveredUpTo: { sentAt: NOW, messageId: "message-1" } },
    },
  }).kind, "valid");
});

for (const type of SERVER_EVENT_TYPES) {
  test(`${type} accepts a conforming payload and returns the original event`, () => {
    const event = { type, payload: FIXTURES[type].valid };
    const result = parseServerEvent(event);
    assert.equal(result.kind, "valid");
    assert.equal(result.kind === "valid" ? result.event : null, event);
  });

  test(`${type} rejects a non-conforming payload without echoing its data`, () => {
    const result = parseServerEvent({ type, payload: FIXTURES[type].invalid });
    assert.equal(result.kind, "invalid");
    if (result.kind !== "invalid") return;
    assert.equal(result.type, type);
    assert.ok(result.issuePaths.length > 0);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("hello"), false);
    assert.equal(serialized.includes("Ada"), false);
  });

  test(`${type} rejects a missing or non-object payload`, () => {
    assert.equal(parseServerEvent({ type }).kind, "invalid");
    assert.equal(parseServerEvent({ type, payload: null }).kind, "invalid");
    assert.equal(parseServerEvent({ type, payload: "text" }).kind, "invalid");
  });
}

test("additive fields from a newer server keep known events valid", () => {
  const event = {
    type: "connection.matched",
    payload: { miniRoomId: "room-1", participantUserIds: ["ada", "bora"], matchedAt: NOW, celebration: "confetti" },
    traceId: "trace-1",
  };
  const result = parseServerEvent(event);
  assert.equal(result.kind, "valid");
  assert.equal(
    result.kind === "valid" ? (result.event.payload as Record<string, unknown>).celebration : undefined,
    "confetti",
  );
});

test("unknown event types from a newer server are reported as unknown, not invalid", () => {
  assert.deepEqual(
    parseServerEvent({ type: "room.decor_updated", payload: { anything: true } }),
    { kind: "unknown", type: "room.decor_updated" },
  );
  assert.deepEqual(
    parseServerEvent({ type: "discovery.match", payload: {} }),
    { kind: "unknown", type: "discovery.match" },
  );
});

test("prototype keys are never treated as known event types", () => {
  assert.equal(parseServerEvent({ type: "toString", payload: {} }).kind, "unknown");
  assert.equal(parseServerEvent({ type: "__proto__", payload: {} }).kind, "unknown");
});

test("the sender's in-room acknowledgement may carry its optional clientMessageId", () => {
  const acknowledged = { type: "chat.message_received", payload: { ...MESSAGE, clientMessageId: "room_client_12345678" } };
  assert.equal(parseServerEvent(acknowledged).kind, "valid");
  // Old payloads without the field stay valid; other unknown keys stay rejected.
  assert.equal(parseServerEvent({ type: "chat.message_received", payload: MESSAGE }).kind, "valid");
  assert.equal(parseServerEvent({ type: "chat.message_received", payload: { ...MESSAGE, clientMessageId: "" } }).kind, "invalid");
  assert.equal(parseServerEvent({ type: "chat.message_received", payload: { ...MESSAGE, extra: true } }).kind, "invalid");
});

test("a refused in-room send is reported to the requester with its clientMessageId", () => {
  const refused = {
    type: "realtime.error",
    payload: {
      code: "CHAT_MESSAGE_NOT_SENT",
      requestType: "chat.send_message",
      message: "Your message was not sent. Try again.",
      clientMessageId: "room_client_12345678",
    },
  };
  assert.equal(parseServerEvent(refused).kind, "valid");
  assert.equal(parseServerEvent({ type: "realtime.error", payload: { ...refused.payload, code: "NOPE" } }).kind, "invalid");
});

test("malformed envelopes are invalid", () => {
  for (const value of [null, "room.left", 42, [], {}, { type: "" , payload: {} }, { type: 7, payload: {} }, { payload: {} }]) {
    assert.deepEqual(parseServerEvent(value), { kind: "invalid", type: null, issuePaths: [] });
  }
});
