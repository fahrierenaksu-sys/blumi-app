# MiniRoom entry and rendering performance

Snapshot: 2026-10-03

Scope: the current Mac checkout, `/Users/evrenevren/blumison`. Existing unrelated dirty work was preserved. No commit, push, release, database migration, runtime artwork change, catalog change, or approval receipt was made.

## Findings and changes

- The entry flight expanded an opaque doorway-light surface to the entire window. It had no carried door artwork. This explains the flat warm screen in the supplied image; it does not prove the cause of the observed JS FPS drop.
- The flight now carries only the existing drawn doorway, with transparent source and target surfaces. It reuses the card's door component without mounting participant avatars, preserves proportions, skips an offscreen source, and fades on the existing UI-thread arrival clock. Reduce Motion bypasses the flight without consuming its source. No generic flight runtime or routing code was changed.
- `useMiniRoomSceneStore` constructed the initial scene in lazy state, then reconstructed it in its first effect and scheduled another render. The initial identical reset is now skipped. Actual participant, appearance, and geometry changes retain the cancellation/reset path. A first authoritative snapshot still places both avatars at scene epoch zero.
- `useInRoomChat` and `useRoomChatHistory` subscribed to the global chat view. Both now use stable conversation snapshots from the existing shared store; unrelated conversations no longer invalidate their rendered history. The underlying store notification remains global. Canonical participant checks, reconnect replay, and optimistic send/acknowledgement remain intact.
- Native investigation encountered a pre-existing `ChatThreadScreen` crash caused by an undefined `opening` variable. The screen now reads `cachedEarlierInviteIds` from the opening hook's destructured result. The real chat screen subsequently opened on the booted iPhone 17 QA Simulator.

Read-only renderer inspection found that initial idle avatars mount a static frame per semantic layer. Walking and sitting frame pools are added on motion transitions. The supplied 1,311 MB RAM reading is an app-wide observation; this work did not measure native cache residency or establish its cause.

## Verification and limits

- Focused scene/movement/keyboard/composer regression tests: 49 passed.
- Thread history and room-chat reconnect regression tests: 9 passed.
- Door source, carried content, Reduce Motion, offscreen fallback, and flight-clock regression tests: 18 passed.
- Complete chat runner including the new door test: 323 + 121 + 3 passed.
- Realtime runner including the new room-history/live-chat tests: 87 + 2 passed.
- Mobile engineering, import boundary, theme, and compiled worklet guards: 25 passed.
- Mobile typecheck and focused ESLint passed.
- Broad match-room runner: 288 passed, 1 failed in the existing source-text `roomStudioProductionIsolation` assertion (`[]` versus `NO_QA_OWNED_ROOM_ITEM_IDS`). That failure predates these MiniRoom changes. Its later hook group was instead exercised with focused commands. The assertion was not weakened.
- The current Metro process serves this checkout. The Simulator's existing invitation had a disabled entry button, so the real MiniRoom entry, final door animation, FPS, memory, loading/error/offline behavior, large text, and native Reduce Motion remain Open. No new invitation was sent to obtain a test route.

Implemented and Tested describe the verified code slices only. Native verified applies only to the chat-screen crash correction. MiniRoom native performance, user approval of the changed transition, and Production ready remain Open. Rollback is the reverse of these isolated code changes; published assets and persisted data are unchanged.

## Requested history and interaction follow-up

- MiniRoom now derives a rolling window of the latest 15 nonblank text messages. New messages evict only the oldest displayed item. The shared chat store and durable server history are not truncated; the main chat can still page through older messages.
- Entry reuses an already-ready latest-page snapshot when the thread summary's latest message is present in the cache. Failed, loading, missing latest-page, and visibly stale snapshots retain the existing fetch path. Eligibility is memoized and searches from the newest cache end. Cached entry preserves single entry replay, live events, optimistic delivery, and reconnect resynchronization.
- Cold entry now uses the chat coordinator's existing authenticated HTTP page request with `limit: 15`, passed as a required screen prop and hook dependency. The HTTP route already accepts this page limit. The room-entry request no longer uses the realtime command with its 50-message default. No server or realtime-protocol change was needed; reconnect continues through the existing root resynchronization flow.
- Floor taps and furniture interactions continue to move the avatar but no longer dismiss the keyboard. The full-screen dismissal backdrop was removed, as was the options-button dismissal. The collapse chevron and chat button under the frame retain keyboard dismissal.
- Avatar-follow camera state, callback, pan worklet, and unused follow calculations were removed. The chosen room shell and angle remain unchanged. Keyboard-driven vertical placement and scale continue to keep the keyboard-open composition usable; avatar movement no longer pans the camera sideways.
- Two GPT-6 Luna xhigh implementation agents owned separate history and scene files. The conductor reviewed the exact patches, challenged stale cache reuse and recurring full-history scanning, and requested the corresponding fixes before acceptance.
- Conductor-run focused history, reconnect, layout, camera, controls, and scene-action tests: 59 passed. Engineering/theme/import/worklet guards: 25 passed. The scene-action test uses a hook harness and is not native gesture verification.
- Full mobile typecheck passed. Focused ESLint found an existing scene callback dependency warning; the conductor bound the callback directly and verified the scene-action test again (1 passed) and a clean scene lint result. The broad match-room runner still stops at the unrelated production-isolation source assertion described above; it was not weakened.
- The subsequent HTTP entry wiring passed 22 MiniRoom hook/history tests and 57 API/coordinator tests, plus full mobile typecheck and focused ESLint. Coverage includes the explicit 15-message request, cached entry without a request, failed requests, live-message buffering/reconnect, and a short 15-message reply merging into an existing 90-message store without deleting older messages.
- Native verified remains Open for these MiniRoom changes. The separate QA Simulator booted, but Device Hub automation lost usable element bindings/screenshot access after opening its independent window. The scene was not reached, and no MiniRoom interaction or performance pass is claimed. The temporary secondary Metro process was stopped; the original Metro was preserved.
