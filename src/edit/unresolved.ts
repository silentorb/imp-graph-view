import {
  graphSource,
  materializeGraph,
  unresolvedNodeIds,
  type Graph,
  type GraphSource,
} from "imp-core-types"

export { unresolvedNodeIds }

/**
 * Graph used for layout: every resolved node plus a stub for each unresolved endpoint, so hosts
 * can place stub cards without writing them into any document.
 */
export function graphWithUnresolvedStubs(source: GraphSource): Graph {
  const graph = materializeGraph(source)
  for (const id of unresolvedNodeIds(source)) {
    graph.nodes[id] = { id, type: UNRESOLVED_NODE_TYPE, inputs: {} }
  }
  return graph
}

/** Display type for stub cards of unresolved endpoints. */
export const UNRESOLVED_NODE_TYPE = "(unresolved)"

/** Unresolved endpoint ids of a materialized graph (edge endpoints without a node). */
export function unresolvedInGraph(graph: Graph): string[] {
  return unresolvedNodeIds(graphSource(graph))
}
