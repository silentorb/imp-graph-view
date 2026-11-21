import type { Graph, NodeTypeId } from "imp-core-types"
import { uniqueNodeId, uniqueNodeTitle } from "./ids"

/** Inserts a node of `typeId` with a unique id, unique display title, and empty inputs. */
export function addImpNode(graph: Graph, typeId: NodeTypeId): Graph {
  const id = uniqueNodeId(graph, typeId)
  const title = uniqueNodeTitle(graph, typeId)
  return {
    nodes: {
      ...graph.nodes,
      [id]: {
        id,
        title,
        type: typeId,
        inputs: {},
      },
    },
    edges: { ...graph.edges },
  }
}
