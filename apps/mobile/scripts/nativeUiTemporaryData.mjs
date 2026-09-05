export function runWithTemporaryDerivedData({ create, cleanup, run }) {
  const derivedDataPath = create()
  try {
    return run(derivedDataPath)
  } finally {
    cleanup(derivedDataPath)
  }
}

export function resolveNativeUiDerivedDataPolicy(rawPath) {
  const explicitPath = rawPath?.trim() || null
  return {
    explicitPath,
    cleanupAfterRun: explicitPath === null
  }
}
