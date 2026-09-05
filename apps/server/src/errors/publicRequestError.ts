export class PublicRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PublicRequestError"
  }
}

export function isPublicRequestError(
  error: unknown
): error is PublicRequestError {
  return error instanceof PublicRequestError
}
