import type { Edge as RfEdge } from "@xyflow/react"
import type { Graph } from "imp-core-types"
import {
  canonicalPortId,
  decodeHandle,
  encodeDummyHandle,
  encodeSingletonHandle,
  encodeVariadicHandle,
  isDummyHandle,
} from "./handles"
import { uniqueEdgeId } from "./ids"
import { nextVariadicOrder, type CatalogInputPort } from "./slots"

export type ImpEdgeData = {
  order?: number
}

/**
 * Map Imp-canonical RF edges (targetHandle = catalog port id) to display handles
 * for variadic slots (`port::order`). Source handles stay catalog port ids.
 *
 * `variadicPorts` is optional: when provided as a set of `nodeId\0portId` keys,
 * edges into those ports are expanded even if `data.order` is missing (use 0).
 */
export function expandEdgesForDisplay(
  edges: RfEdge[],
  variadicPorts?: ReadonlySet<string>,
): RfEdge[] {
  // Stable order index when multiple unordered edges share a variadic port.
  const nextIndex = new Map<string, number>()

  return edges.map((edge) => {
    const targetHandle = edge.targetHandle ?? ""
    if (targetHandle === "" || targetHandle.includes("::")) {
      return edge
    }

    const orderFromData = (edge.data as ImpEdgeData | undefined)?.order
    const key = `${edge.target}\0${targetHandle}`
    const isVariadic =
      typeof orderFromData === "number" ||
      (variadicPorts?.has(key) ?? false)

    if (!isVariadic) {
      return edge
    }

    let order = orderFromData
    if (typeof order !== "number") {
      order = nextIndex.get(key) ?? 0
      nextIndex.set(key, order + 1)
    }

    return {
      ...edge,
      targetHandle: encodeVariadicHandle(targetHandle, order),
      data: { ...(edge.data as object), order },
    }
  })
}

/** Build `nodeId\0portId` keys for every variadic catalog input on a graph. */
export function variadicPortKeys(
  nodePorts: Iterable<{ nodeId: string; inputs: CatalogInputPort[] }>,
): Set<string> {
  const keys = new Set<string>()
  for (const { nodeId, inputs } of nodePorts) {
    for (const port of inputs) {
      if (port.variadic) {
        keys.add(`${nodeId}\0${port.id}`)
      }
    }
  }
  return keys
}

/**
 * Collapse display handles back to Imp catalog port ids before `reactFlowToImp`.
 * Dummy handles should not appear on stored edges.
 */
export function collapseEdgesForImp(edges: RfEdge[]): RfEdge[] {
  return edges
    .filter((edge) => !isDummyHandle(edge.targetHandle))
    .map((edge) => {
      const decoded = decodeHandle(edge.targetHandle)
      if (decoded == null) {
        return edge
      }
      if (decoded.kind === "variadic") {
        return {
          ...edge,
          targetHandle: decoded.portId,
          data: { ...(edge.data as object), order: decoded.order },
        }
      }
      return edge
    })
}

function edgesAsTempGraph(edges: RfEdge[]): Graph {
  const nodes: Graph["nodes"] = {}
  const impEdges: Graph["edges"] = {}
  for (const e of collapseEdgesForImp(edges)) {
    nodes[e.source] = nodes[e.source] ?? { id: e.source, type: "", inputs: {} }
    nodes[e.target] = nodes[e.target] ?? { id: e.target, type: "", inputs: {} }
    const fromPort = canonicalPortId(e.sourceHandle) ?? e.sourceHandle ?? ""
    const toPort = canonicalPortId(e.targetHandle) ?? e.targetHandle ?? ""
    impEdges[e.id] = {
      from: { node: e.source, port: fromPort },
      to: { node: e.target, port: toPort },
      order: (e.data as ImpEdgeData | undefined)?.order,
    }
  }
  return { nodes, edges: impEdges }
}

export type ConnectResult = {
  edges: RfEdge[]
  accepted: boolean
}

/**
 * Apply a Precise connect: singleton replace, or variadic append with order.
 * `targetHandle` may be a display handle (dummy / ordered / singleton).
 */
export function applyPreciseConnect(
  edges: RfEdge[],
  connection: {
    source: string | null
    target: string | null
    sourceHandle?: string | null
    targetHandle?: string | null
  },
): ConnectResult {
  const { source, target, sourceHandle, targetHandle } = connection
  if (!source || !target || !sourceHandle) {
    return { edges, accepted: false }
  }

  const decoded = decodeHandle(targetHandle)
  if (decoded == null || decoded.kind === "variadic") {
    return { edges, accepted: false }
  }

  const portId = decoded.portId
  const sourcePort = canonicalPortId(sourceHandle) ?? sourceHandle
  const tempGraph = edgesAsTempGraph(edges)

  if (decoded.kind === "dummy") {
    const order = nextVariadicOrder(tempGraph, target, portId)
    const id = uniqueEdgeId(tempGraph, source, sourcePort, target, portId)
    const next: RfEdge = {
      id,
      source,
      target,
      sourceHandle: sourcePort,
      targetHandle: encodeVariadicHandle(portId, order),
      data: { order },
    }
    return { edges: [...edges, next], accepted: true }
  }

  // Singleton: drop any inbound on this catalog port, then add.
  const cleared = edges.filter((edge) => {
    if (edge.target !== target) return true
    return canonicalPortId(edge.targetHandle) !== portId
  })
  const id = uniqueEdgeId(
    edgesAsTempGraph(cleared),
    source,
    sourcePort,
    target,
    portId,
  )
  const next: RfEdge = {
    id,
    source,
    target,
    sourceHandle: sourcePort,
    targetHandle: encodeSingletonHandle(portId),
  }
  return { edges: [...cleared, next], accepted: true }
}

/** @internal */
export function dummyHandleFor(portId: string): string {
  return encodeDummyHandle(portId)
}
