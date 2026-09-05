export type ApiFetcher = typeof fetch
export const JSON_REQUEST_TIMEOUT_MS = 15_000

export interface ApiJsonResponse<Payload> {
  response: Response
  payload: Payload
}

export function buildApiUrl(baseHttpUrl: string, path: string): string {
  const base = baseHttpUrl.endsWith("/")
    ? baseHttpUrl.slice(0, -1)
    : baseHttpUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${base}${normalizedPath}`
}

export function createAuthenticatedHeaders(
  sessionToken: string,
  options: { json?: boolean } = {}
): Record<string, string> {
  return {
    authorization: `Bearer ${sessionToken}`,
    ...(options.json ? { "content-type": "application/json" } : {})
  }
}

export async function requestJson<Payload = unknown>(
  baseHttpUrl: string,
  path: string,
  init: RequestInit,
  fetcher: ApiFetcher = fetch
): Promise<ApiJsonResponse<Payload>> {
  const callerSignal = init.signal
  if (callerSignal?.aborted) throw requestCancelledError()
  const controller = new AbortController()
  let cancelRequest!: () => void
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    cancelRequest = () => {
      reject(requestCancelledError())
      controller.abort()
    }
    callerSignal?.addEventListener("abort", cancelRequest, { once: true })
    timeout = setTimeout(() => {
      const error = new Error("This is taking too long. Check your connection and try again.")
      error.name = "TimeoutError"
      reject(error)
      controller.abort()
    }, JSON_REQUEST_TIMEOUT_MS)
  })
  try {
    // Race the whole operation, not just fetch headers. Some transports ignore
    // AbortSignal and can leave response.json() unresolved indefinitely.
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetcher(buildApiUrl(baseHttpUrl, path), {
          ...init, signal: controller.signal
        })
        const payload = await readJsonPayload(response) as Payload
        return { response, payload }
      })()
    ])
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener("abort", cancelRequest)
  }
}

function requestCancelledError(): Error {
  const error = new Error("Request cancelled.")
  error.name = "AbortError"
  return error
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}
