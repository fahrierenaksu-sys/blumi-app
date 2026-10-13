/**
 * The server's refusal of a room that holds an item the account does not own (HTTP 400, public message below).
 * The server sends no error code for it, so the API client recognises status plus message and throws this type; the
 * sign-up flow retries without the starter bed only for this error.
 */
export const ROOM_DECOR_UNOWNED_ITEM_MESSAGE = "Your room includes an item you do not own."

export class RoomDecorItemNotOwnedError extends Error {
  constructor(message: string = ROOM_DECOR_UNOWNED_ITEM_MESSAGE) {
    super(message)
    this.name = "RoomDecorItemNotOwnedError"
  }
}

export function isRoomDecorUnownedItemRefusal(status: number, message: string | null): boolean {
  return status === 400 && message === ROOM_DECOR_UNOWNED_ITEM_MESSAGE
}
