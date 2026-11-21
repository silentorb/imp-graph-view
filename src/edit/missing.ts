import type { Graph, NodeId } from "imp-core-types"

/** Edge endpoint ids that are absent from `graph.nodes`. */
export function missingNodeIds(graph: Graph): NodeId[] {
  const missing = new Set<NodeId>()
  for (const edge of Object.values(graph.edges)) {
    if (!(edge.from.node in graph.nodes)) {
      missing.add(edge.from.node)
    }
    if (!(edge.to.node in graph.nodes)) {
      missing.add(edge.to.node)
    }
  }
  return [...missing]
}

/**
 * Graph view used for layout: includes stub nodes for dangling edge endpoints
 * so hosts can place missing cards without writing them into the document.
 */
export function graphWithMissingStubs(graph: Graph): Graph {
  const nodes = { ...graph.nodes }
  for (const id of missingNodeIds(graph)) {
    nodes[id] = {
      id,
      type: "(missing)",
      inputs: {},
    }
  }
  return { nodes, edges: graph.edges }
}
