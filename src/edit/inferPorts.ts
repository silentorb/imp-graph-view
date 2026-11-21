import type { Edge as RfEdge } from "@xyflow/react"
import { canonicalPortId } from "./handles"
import type { CatalogInputPort, CatalogOutputPort } from "./slots"

export type InferredPortLists = {
  inputs: CatalogInputPort[]
  outputs: CatalogOutputPort[]
}

type InboundStat = {
  count: number
  hasOrder: boolean
}

/**
 * Infer port lists from incident RF edges when no catalog definition exists.
 *
 * A target port is variadic only when it has multiple inbound edges or any
 * inbound edge carries `data.order`. Blindly marking every inferred input as
 * variadic breaks drawing: slots use `port::order` handles while edges still
 * target bare catalog port ids.
 */
export function inferPortsFromEdges(
  nodeId: string,
  edges: RfEdge[],
): InferredPortLists {
  const inbound = new Map<string, InboundStat>()
  const outputs = new Map<string, CatalogOutputPort>()

  for (const edge of edges) {
    if (edge.target === nodeId) {
      const portId = canonicalPortId(edge.targetHandle)
      if (portId) {
        const prev = inbound.get(portId) ?? { count: 0, hasOrder: false }
        const order = (edge.data as { order?: number } | undefined)?.order
        inbound.set(portId, {
          count: prev.count + 1,
          hasOrder: prev.hasOrder || typeof order === "number",
        })
      }
    }
    if (edge.source === nodeId) {
      const portId = canonicalPortId(edge.sourceHandle)
      if (portId) {
        outputs.set(portId, { id: portId })
      }
    }
  }

  const inputs: CatalogInputPort[] = [...inbound.entries()].map(
    ([id, stat]) => ({
      id,
      variadic: stat.count > 1 || stat.hasOrder,
    }),
  )

  return {
    inputs,
    outputs: [...outputs.values()],
  }
}
