import type { Graph, NodeId } from "imp-core-types"

/** Allocates a unique node id from a type-based base (`sine`, `sine_2`, …). */
export function uniqueNodeId(graph: Graph, base: string): NodeId {
  if (!(base in graph.nodes)) {
    return base
  }
  let index = 2
  for (;;) {
    const candidate = `${base}_${index}`
    if (!(candidate in graph.nodes)) {
      return candidate
    }
    index += 1
  }
}

/** Allocates a unique edge id from endpoint + port names. */
export function uniqueEdgeId(
  graph: Graph,
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): string {
  const base = `${from}_${fromPort}_to_${to}_${toPort}`
  if (!(base in graph.edges)) {
    return base
  }
  let index = 2
  for (;;) {
    const candidate = `${base}_${index}`
    if (!(candidate in graph.edges)) {
      return candidate
    }
    index += 1
  }
}
