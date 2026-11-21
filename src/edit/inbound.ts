/** Drop existing edges that target the same input port (replace-on-connect for singletons). */
export function withoutInboundToPort<
  T extends { target: string; targetHandle?: string | null },
>(edges: T[], target: string, targetHandle: string | null | undefined): T[] {
  const handle = targetHandle ?? ""
  return edges.filter(
    (edge) => !(edge.target === target && (edge.targetHandle ?? "") === handle),
  )
}

/**
 * Keep the last inbound edge per (target, targetHandle).
 * Last wins so a newer wire replaces a stale inbound on a singleton port.
 */
export function dedupeInboundReactFlowEdges<
  T extends { target: string; targetHandle?: string | null },
>(edges: T[]): T[] {
  const byTarget = new Map<string, T>()
  for (const edge of edges) {
    const key = `${edge.target}\0${edge.targetHandle ?? ""}`
    byTarget.set(key, edge)
  }
  const kept = new Set(byTarget.values())
  return edges.filter((edge) => kept.has(edge))
}
