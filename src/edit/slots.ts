import type {
  EdgeId,
  Graph,
  PortId,
  PrimitiveValue,
  SignalType,
} from "imp-core-types"
import {
  encodeDummyHandle,
  encodeSingletonHandle,
  encodeVariadicHandle,
} from "./handles"

export type CatalogInputPort = {
  id: PortId
  variadic?: boolean
  /** Catalog signal type when the host knows it (literal editors). */
  signalType?: SignalType
  /** Catalog default when the host knows it (empty-field display hint). */
  defaultValue?: PrimitiveValue
}

export type CatalogOutputPort = {
  id: PortId
}

/** Expanded input slot for Precise-mode handles. */
export type InputSlot =
  | {
      kind: "singleton"
      portId: string
      handleId: string
      label: string
      signalType?: SignalType
      defaultValue?: PrimitiveValue
    }
  | {
      kind: "variadic"
      portId: string
      handleId: string
      label: string
      edgeId: string
      order: number
    }
  | { kind: "dummy"; portId: string; handleId: string; label: string }

export type OutputSlot = {
  portId: string
  handleId: string
  label: string
}

/** Next `Edge.order` for a variadic target (max existing + 1, or 0). */
export function nextVariadicOrder(
  graph: Graph,
  toNode: string,
  toPort: string,
): number {
  let max = -1
  for (const edge of Object.values(graph.edges)) {
    if (edge.to.node === toNode && edge.to.port === toPort && edge.order !== undefined) {
      max = Math.max(max, edge.order)
    }
  }
  return max + 1
}

/**
 * Rewrites `Edge.order` for a variadic fan-in to match `orderedEdgeIds` (`0..n-1`).
 * `orderedEdgeIds` must be exactly the set of edges into `(nodeId, port)`.
 */
export function reorderVariadicInputs(
  graph: Graph,
  nodeId: string,
  port: string,
  orderedEdgeIds: EdgeId[],
): Graph {
  const fanIn = Object.entries(graph.edges).filter(
    ([, edge]) => edge.to.node === nodeId && edge.to.port === port,
  )
  if (fanIn.length !== orderedEdgeIds.length) {
    throw new Error(`invalid variadic reorder for \`${nodeId}\` port \`${port}\``)
  }
  const fanInIds = new Set(fanIn.map(([id]) => id))
  for (const id of orderedEdgeIds) {
    if (!fanInIds.has(id)) {
      throw new Error(`invalid variadic reorder for \`${nodeId}\` port \`${port}\``)
    }
  }

  const edges = { ...graph.edges }
  orderedEdgeIds.forEach((id, index) => {
    const prev = edges[id]
    edges[id] = { ...prev, order: index }
  })
  return { nodes: graph.nodes, edges }
}

/** Expands catalog inputs into ordered visual slots (variadic filled + trailing dummy). */
export function expandInputSlots(
  catalogInputs: CatalogInputPort[],
  graph: Graph,
  nodeId: string,
): InputSlot[] {
  const slots: InputSlot[] = []
  for (const port of catalogInputs) {
    if (!port.variadic) {
      slots.push({
        kind: "singleton",
        portId: port.id,
        handleId: encodeSingletonHandle(port.id),
        label: port.id,
        signalType: port.signalType,
        defaultValue: port.defaultValue,
      })
      continue
    }

    const fanIn: { edgeId: string; order: number }[] = []
    for (const [edgeId, edge] of Object.entries(graph.edges)) {
      if (edge.to.node === nodeId && edge.to.port === port.id) {
        fanIn.push({ edgeId, order: edge.order ?? 0 })
      }
    }
    fanIn.sort((a, b) => a.order - b.order)
    for (const { edgeId, order } of fanIn) {
      slots.push({
        kind: "variadic",
        portId: port.id,
        handleId: encodeVariadicHandle(port.id, order),
        label: `${port.id} ${order}`,
        edgeId,
        order,
      })
    }
    slots.push({
      kind: "dummy",
      portId: port.id,
      handleId: encodeDummyHandle(port.id),
      label: `${port.id}+`,
    })
  }
  return slots
}

export function expandOutputSlots(catalogOutputs: CatalogOutputPort[]): OutputSlot[] {
  return catalogOutputs.map((port) => ({
    portId: port.id,
    handleId: encodeSingletonHandle(port.id),
    label: port.id,
  }))
}

export function slotAcceptsConnect(slot: InputSlot): boolean {
  return slot.kind === "singleton" || slot.kind === "dummy"
}
