# Realtime limits (2026-09-30)

Audit item 10H ("slow-consumer handling; fanout > 100 targets"). Code
evidence only; no load test or device evidence yet.

## Slow consumers

Before: `connectionManager` called `socket.send` with no check of
`socket.bufferedAmount`, so a client that stopped reading let `ws` buffer
events in server memory without limit.

Policy (`apps/server/src/realtime/connectionManager.ts`), checked on every
send to a socket:

| Buffered bytes | Action |
|----------------|--------|
| At or below 256 KiB (soft) | Send normally; reset the slow window. |
| Above soft | Drop transient events for this socket (`presence.snapshot`, `presence.nearby`, `reaction.received`, `chat.receipt_updated`); still send everything else, including `chat.message_received`. Start a 10 s window. |
| Above soft for 10 s | Close with 1013 (try again later), stop writing, terminate after 1 s. |
| Above 1 MiB (hard) at any time | Same close immediately. |

Why this combination:

- Shedding first keeps a briefly congested client (lift, tunnel) connected:
  the dropped events are superseded by the next presence snapshot or are
  ephemeral reactions. Receipt cursors (2026-10-01) are cumulative: the next
  receipt event or thread/message list refresh carries the dropped position.
- Closing bounds memory: a socket holds at most the hard limit plus one
  event. `close` queues its frame behind the backlog, so the socket is
  terminated one second later rather than waiting for `ws`'s 30 s timeout.
- Chat is never shed while the socket stays open, and closing loses nothing
  durable: messages are committed with a delivery outbox before fanout, and
  the mobile client (`packages/realtime-client/src/realtimeClient.ts`)
  reconnects with backoff on any close code except 1008 and 4401, then
  reconciles from the API. That is why 1013 is used rather than 1008: 1008
  would stop the client from reconnecting.
- 1013 is distinct from the existing 1012 (fanout gap resynchronization) and
  4429 (authorization backlog), so logs can tell the causes apart.
- Update 2026-10-01: 1012 is also the graceful-restart close (reason "Server
  restarting"), and the client spreads its first retry after 1001, 1012 and
  1013 over 0-5 s. Chat is no longer closed with 4429 at a human rate; see
  `docs/quality/REALTIME_CAPACITY_2026-10-01.md`.

The window is only evaluated on a send. A socket that receives nothing more
does not grow; liveness pings handle dead peers.

## Fanout above 100 targets

Before: receivers validate `users` targets at 100 IDs or fewer, and
publishers did not split larger audiences, so a message to more than 100
users was silently dropped on every other instance.

Now:

- `splitRealtimeFanoutTarget` splits a `users` target into chunks of at most
  `MAX_REALTIME_FANOUT_USER_TARGETS` (100). `connectionManager` publishes one
  message per chunk for both best-effort and durable sends. A durable send
  awaits every chunk and rejects if any fails, so the chat delivery outbox
  retries; recipients deduplicate by message ID.
- The PostgreSQL publisher rejects an unsplit `users` target above 100 with
  an explicit error instead of sending a payload receivers would drop.
- The NOTIFY bound is unchanged: each chunk is serialized on its own and
  larger payloads still use the payload-reference path.

## Tests

`apps/server/src/realtime/connectionManager.limits.test.ts`: transient
shedding with chat still delivered; sustained-window close and reset;
hard-limit close and timer cleanup; the policy after asynchronous
authorization; chunking without loss (250 IDs into 100/100/50); 205 remote
recipients reached through a validating fanout for best-effort and durable
sends; durable failure when a chunk fails; PostgreSQL publisher rejection.
Existing realtime tests are unchanged.

## Deploy note

No migration or configuration change. Mixed-version rollout is safe: chunked
messages are valid for old receivers. A client on a very slow link may now
see a 1013 close and reconnect instead of the server buffering without limit.
Open: measure real `bufferedAmount` under load before tuning the limits.

## Inbound limits and request replies (adversarial pass, 2026-09-30)

Evidence: `apps/server/src/realtime/realtimeServer.adversarial.test.ts`.

- The per-user event window (100 events per 10 s) now outlives the socket.
  Before, closing the last socket deleted it, so a reconnect inside the window
  started a fresh budget (each reconnect admitted up to 60 more events). The
  heartbeat purges expired windows, so memory stays bounded by users active in
  the last window plus one heartbeat.
- `chat.list_threads` and `chat.list_messages` are answered on the requesting
  socket only. Before, the reply went to every socket of the user; the mobile
  client requests the next page for every page with a cursor, so with two
  devices each page doubled the requests (measured: 3 pages cost 7 page
  queries instead of 3). Page k cost 2^(k-1) requests, so a long thread list
  would eventually exceed the 8 in-flight limit and be closed with 4429
  (reasoned from the limits, not measured).
- `room.leave` without a string `roomId` is ignored instead of echoing a
  `room.left` event the client contract rejects.
- Unchanged and known: a burst of more than 8 events in flight on one socket
  is closed with 4429; client frames are shape-checked by the router, not by a
  shared schema.

## Reconnect policy, upgrade limit and in-room acknowledgement (group 3, 2026-09-30)

Evidence: `packages/realtime-client/src/realtimeClient*.test.ts`,
`apps/server/src/realtime/realtimeServer.adversarial.test.ts`. No device or
load evidence.

- Mobile reconnect (`realtimeClient.ts`): the first 10 attempts keep the
  equal-jitter backoff (1 s doubling, 30 s cap) and report `reconnecting`.
  After that the client reports `unreachable` and keeps retrying with a 60 s
  cap for as long as the app is foregrounded and a session exists. Retries
  pause in the background; foreground and network regain retry at once. A
  refused session (401/403 ticket, 1008/4401 close) and sign-out stop retries.
  The backoff resets only after a socket stayed open for 10 s or delivered an
  authenticated server event, so an accept-then-close loop (4429, 1011, 1013)
  keeps growing its delay.
- Pre-authentication upgrades: at most 40 per client address per 10 s window,
  counted before the ticket is consumed; above it the upgrade gets 429. The
  address is the socket address, or with `BLUMI_TRUST_PROXY` set the same
  forwarded address Fastify reports as `request.ip` (`@fastify/proxy-addr`).
  Tracked addresses are purged by the heartbeat and capped at 10,000.
- In-room `chat.send_message` may carry an optional `clientMessageId`. The
  server sends it through the same idempotent send as HTTP, acknowledges on
  the requesting socket only with `chat.message_received` plus
  `clientMessageId`, and reports a failure there as `realtime.error`
  `CHAT_MESSAGE_NOT_SENT` with the id. Frames without the id behave as before,
  so clients that predate the field never receive either shape.

## Delivery acknowledgements (2026-10-01)

Evidence: `apps/server/src/realtime/realtimeServer.test.ts`,
`connectionManager.limits.test.ts`, `realtimeFanout.test.ts`.

- `chat.ack_delivered` has its own silent lane, like `mini_room.move`: 30 per
  user per 10 s window, 2 in flight per socket, 4 per user. Over the lane the
  frame is dropped without a reply; it never spends the shared 100-event
  budget or closes a socket with 4429. The mobile client batches acks (one per
  thread per 400 ms, foreground only), and cursors are cumulative, so a
  dropped ack is repaired by the next one or by the next history load.
- `chat.receipt_updated` is transient (shed above the soft limit) and the
  fanout validator only lets it reach the other participant of the thread.
