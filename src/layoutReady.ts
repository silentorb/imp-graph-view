import type { Graph } from "imp-core-types"

export type LayoutBoxLike = {
  x: number
  y: number
  width?: number
  height?: number
}

export type LayoutMapLike =
  | ReadonlyMap<string, LayoutBoxLike>
  | Record<string, LayoutBoxLike>

function layoutLookup(
  layout: LayoutMapLike | undefined,
  id: string,
): LayoutBoxLike | undefined {
  if (!layout) return undefined
  if (layout instanceof Map) return layout.get(id)
  return Object.prototype.hasOwnProperty.call(layout, id)
    ? (layout as Record<string, LayoutBoxLike>)[id]
    : undefined
}

function layoutHasBox(layout: LayoutMapLike, id: string): boolean {
  return layoutLookup(layout, id) !== undefined
}

/**
 * Whether positions are ready to fit the viewport.
 * - `layout` omitted → ready (host does not supply layout; nodes stay at defaults).
 * - Map/Record ready when at least one graph or dangling-edge node id has a box.
 * - Empty map → not ready (host still computing layout).
 */
export function layoutReadyForGraph(
  layout: LayoutMapLike | undefined,
  graph: Graph,
): boolean {
  if (layout === undefined) return true

  for (const id of Object.keys(graph.nodes)) {
    if (layoutHasBox(layout, id)) return true
  }
  for (const edge of Object.values(graph.edges)) {
    if (layoutHasBox(layout, edge.from.node)) return true
    if (layoutHasBox(layout, edge.to.node)) return true
  }
  return false
}

/** True when flow node state already carries at least one host layout box. */
export function nodesReflectLayout(
  nodes: ReadonlyArray<{ id: string; position: { x: number; y: number } }>,
  layout: LayoutMapLike | undefined,
): boolean {
  if (layout === undefined) return true
  for (const n of nodes) {
    const box = layoutLookup(layout, n.id)
    if (box && n.position.x === box.x && n.position.y === box.y) return true
  }
  return false
}

/** True when every Imp graph node id is present in the current flow node list. */
export function nodesMatchGraph(
  nodes: ReadonlyArray<{ id: string }>,
  graph: Graph,
): boolean {
  const ids = new Set(nodes.map((n) => n.id))
  const graphIds = Object.keys(graph.nodes)
  if (graphIds.length === 0) return false
  return graphIds.every((id) => ids.has(id))
}
