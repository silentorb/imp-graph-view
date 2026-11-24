/** Client-side ranking for quick-pick searches (node types, records, commands). */

/** Lower is better; `undefined` = no match. */
function matchScore(text: string, query: string): number | undefined {
  const haystack = text.toLowerCase()
  if (haystack === query) return 0
  if (haystack.startsWith(query)) return 1
  const index = haystack.indexOf(query)
  if (index > 0) {
    // A match at a word start (`sine` in `osc_sine`, `Sine` in `OscSine`) beats one mid-word.
    const before = text[index - 1]!
    const at = text[index]!
    const wordStart =
      /[\s_.\-/:]/.test(before) || (before === before.toLowerCase() && at !== at.toLowerCase())
    return wordStart ? 2 : 3
  }
  // In-order letters: `osn` matches `osc_sine`.
  let from = 0
  for (const ch of query) {
    const found = haystack.indexOf(ch, from)
    if (found < 0) return undefined
    from = found + 1
  }
  return 4
}

/**
 * Items whose texts match `query`, best first: exact, prefix, word-start, substring, then
 * in-order letters. Ties keep shorter texts first, then alphabetical. An empty query returns
 * every item sorted alphabetically by its first text.
 */
export function rankByQuery<T>(
  items: readonly T[],
  query: string,
  texts: (item: T) => readonly (string | undefined)[],
): T[] {
  const q = query.trim().toLowerCase()
  const primary = (item: T) => texts(item).find((t) => t) ?? ""
  if (q === "") {
    return [...items].sort((a, b) => primary(a).localeCompare(primary(b)))
  }
  const scored: { item: T; score: number; length: number; label: string }[] = []
  for (const item of items) {
    let best: { score: number; length: number } | undefined
    for (const text of texts(item)) {
      if (!text) continue
      const score = matchScore(text, q)
      if (score === undefined) continue
      if (!best || score < best.score || (score === best.score && text.length < best.length)) {
        best = { score, length: text.length }
      }
    }
    if (best) scored.push({ item, ...best, label: primary(item) })
  }
  scored.sort(
    (a, b) => a.score - b.score || a.length - b.length || a.label.localeCompare(b.label),
  )
  return scored.map((s) => s.item)
}
