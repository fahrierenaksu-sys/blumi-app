import { buildApiUrl } from "../network/apiClient"

export interface AccountExportFile { uri: string; dispose(): Promise<void> }
export interface AccountExportSink extends AccountExportFile {
  write(bytes: Uint8Array): void
  close(): void
}

export async function downloadAccountDataExport(
  baseHttpUrl: string, sessionToken: string, confirmationToken: string,
  fetcher?: typeof fetch, signal?: AbortSignal, createSink?: () => AccountExportSink
): Promise<AccountExportFile> {
  if (signal?.aborted) throw exportAbortError()
  const native = !fetcher || !createSink ? await import("./accountDataExportNative") : null
  const request = fetcher ?? native!.exportFetch
  const makeSink = createSink ?? native!.createAccountExportSink
  const controller = new AbortController()
  let sink: AccountExportSink | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let abort!: () => void
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => { reject(exportAbortError()); controller.abort() }
    signal?.addEventListener("abort", abort, { once: true })
    timeout = setTimeout(() => {
      const error = new Error("The export timed out. Please request a new security code and try again.")
      error.name = "TimeoutError"
      reject(error)
      controller.abort()
    }, 120_000)
    if (signal?.aborted) abort()
  })
  try {
    return await Promise.race([deadline, (async () => {
      const response = await request(buildApiUrl(baseHttpUrl, "/v1/account/export"), {
        method: "POST", headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmationToken }), signal: controller.signal
      })
      if (controller.signal.aborted) throw exportAbortError()
      if (!response.ok) throw new Error("We could not prepare your account data. Request a new security code and try again.")
      if (!response.body || response.headers.get("x-blumi-export-format") !== "json-v1" ||
        !response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("This export cannot be downloaded safely yet.")
      }
      sink = makeSink()
      reader = response.body.getReader()
      let tail: number[] = []
      for (;;) {
        const chunk = await reader.read()
        if (controller.signal.aborted) throw exportAbortError()
        if (chunk.done) break
        sink.write(chunk.value)
        tail = [...tail, ...chunk.value.slice(-3)].slice(-3)
      }
      // Server sends this completion delimiter only after committing its snapshot.
      // JSON consumers remain compatible; no full JSON parse/buffer is needed.
      if (tail.join(",") !== "125,125,10") throw new Error("The export download is incomplete. Please try again.")
      sink.close()
      return { uri: sink.uri, dispose: sink.dispose }
    })()])
  } catch (error) {
    controller.abort()
    void reader?.cancel().catch(() => undefined)
    try { sink?.close() } finally { await sink?.dispose() }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
  }
}

export async function shareAccountDataExportFile(file: AccountExportFile, dependencies?: {
  available: () => Promise<boolean>
  share: (uri: string, options: { mimeType: string; UTI: string; dialogTitle: string }) => Promise<void>
}): Promise<void> {
  try {
    const sharing = dependencies ?? await import("./accountDataExportNative").then((native) => native.exportSharing)
    if (!sharing || !await sharing.available()) throw new Error("File sharing is unavailable on this device.")
    await sharing.share(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Blumi account data" })
  } finally {
    await file.dispose()
  }
}

function exportAbortError(): Error {
  const error = new Error("Export cancelled.")
  error.name = "AbortError"
  return error
}
