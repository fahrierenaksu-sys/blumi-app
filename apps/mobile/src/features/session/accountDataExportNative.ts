import { File, FileMode, Paths } from "expo-file-system"
import { fetch as expoFetch } from "expo/fetch"
import * as Sharing from "expo-sharing"
import type { AccountExportSink } from "./accountDataExport"

export const exportFetch = expoFetch as typeof fetch
export const exportSharing = { available: Sharing.isAvailableAsync, share: Sharing.shareAsync }

export function createAccountExportSink(): AccountExportSink {
  const file = new File(Paths.cache, `blumi-account-data-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  file.create({ overwrite: false })
  let handle: ReturnType<File["open"]>
  try { handle = file.open(FileMode.WriteOnly) } catch (error) { file.delete(); throw error }
  let closed = false
  return {
    uri: file.uri,
    write: (bytes) => { handle.writeBytes(bytes) },
    close: () => { if (!closed) { handle.close(); closed = true } },
    dispose: async () => {
      if (!closed) { handle.close(); closed = true }
      if (file.exists) file.delete()
    }
  }
}
