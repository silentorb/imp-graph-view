import type { Graph, NodeId } from "imp-core-types"

/**
 * Sets or clears a node's optional display title.
 * Empty / whitespace-only values omit `title`.
 * Returns the same graph reference when the node is missing.
 */
export function setNodeTitle(
  graph: Graph,
  nodeId: NodeId,
  title: string | null | undefined,
): Graph {
  const node = graph.nodes[nodeId]
  if (!node) {
    return graph
  }

  const trimmed =
    title == null ? "" : typeof title === "string" ? title.trim() : ""
  const nextTitle = trimmed === "" ? undefined : trimmed
  if (node.title === nextTitle) {
    return graph
  }

  const nextNode = { ...node }
  if (nextTitle === undefined) {
    delete nextNode.title
  } else {
    nextNode.title = nextTitle
  }

  return {
    nodes: {
      ...graph.nodes,
      [nodeId]: nextNode,
    },
    edges: graph.edges,
  }
}
