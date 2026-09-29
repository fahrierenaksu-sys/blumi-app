export function scheduleMatchResultNavigation(
  navigate: () => void,
  isFocused: () => boolean,
  delayMs = 260
): () => void {
  let cancelled = false
  const timer = setTimeout(() => {
    if (!cancelled && isFocused()) navigate()
  }, delayMs)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
