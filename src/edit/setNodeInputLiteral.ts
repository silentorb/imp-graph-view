import type { Graph, NodeId, PortId, PrimitiveValue } from "imp-core-types"

function samePrimitive(
  a: PrimitiveValue | undefined,
  b: PrimitiveValue | undefined,
): boolean {
  return Object.is(a, b)
}

/**
 * Sets or clears a local input literal on a node.
 * Pass `undefined` to remove the key; `null` is a stored literal.
 * Returns the same graph reference when the node is missing or unchanged.
 */
export function setNodeInputLiteral(
  graph: Graph,
  nodeId: NodeId,
  portId: PortId,
  value: PrimitiveValue | undefined,
): Graph {
  const node = graph.nodes[nodeId]
  if (!node) {
    return graph
  }

  const prev = node.inputs[portId]
  const hadKey = Object.prototype.hasOwnProperty.call(node.inputs, portId)
  if (value === undefined) {
    if (!hadKey) {
      return graph
    }
  } else if (hadKey && samePrimitive(prev, value)) {
    return graph
  }

  const nextInputs = { ...node.inputs }
  if (value === undefined) {
    delete nextInputs[portId]
  } else {
    nextInputs[portId] = value
  }

  return {
    nodes: {
      ...graph.nodes,
      [nodeId]: { ...node, inputs: nextInputs },
    },
    edges: graph.edges,
  }
}
