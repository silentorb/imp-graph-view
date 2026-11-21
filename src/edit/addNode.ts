import type { Graph, NodeTypeId } from "imp-core-types"
import { uniqueNodeId } from "./ids"

/** Inserts a node of `typeId` with a unique id and empty inputs. */
export function addImpNode(graph: Graph, typeId: NodeTypeId): Graph {
  const id = uniqueNodeId(graph, typeId)
  return {
    nodes: {
      ...graph.nodes,
      [id]: {
        id,
        type: typeId,
        inputs: {},
      },
    },
    edges: { ...graph.edges },
  }
}
