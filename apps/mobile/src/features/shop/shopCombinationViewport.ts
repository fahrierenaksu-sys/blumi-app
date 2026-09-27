/** Reserve the pager and purchase action; never expose a clipped partial row. */
export function getCombinationPageSize(stageHeight: number, fontScale = 1, itemCount = 4) {
  const rowHeight = Math.max(34, Math.ceil(26 * Math.max(1, fontScale)))
  const headingHeight = Math.ceil(16 * Math.max(1, fontScale))
  const singlePageHeight = itemCount * rowHeight + Math.max(0, itemCount - 1) * 3 + 60 + headingHeight
  const headerHeight = itemCount <= 4 && singlePageHeight <= stageHeight ? headingHeight : Math.max(44, headingHeight)
  const available = stageHeight - 8 - headerHeight - 44 - 8
  return Math.max(1, Math.min(4, Math.floor((available + 3) / (rowHeight + 3))))
}

export function getCombinationPage<T extends { id: string }>(items: readonly T[], pageSize: number, page: number) {
  const size = Math.max(1, pageSize)
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const index = Math.max(0, Math.min(page, pageCount - 1))
  const start = index * size
  return { page: index, pageCount, start, end: Math.min(items.length, start + size), items: items.slice(start, start + size) }
}

export function getCombinationSelectionPage(items: readonly { id: string }[], selectedId: string | undefined, pageSize: number) {
  return Math.floor(Math.max(0, items.findIndex((item) => item.id === selectedId)) / Math.max(1, pageSize))
}
