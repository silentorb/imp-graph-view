import type {
  Edge,
  EdgeId,
  Graph,
  InputValues,
  Node,
  NodeId,
  NodeTypeId,
  SignalType,
} from "imp-core-types"

/** Node field changes. `null` clears an optional field. */
export type NodePatch = {
  type?: NodeTypeId
  title?: string | null
  typeArgs?: SignalType[] | null
  inputs?: InputValues
}

/**
 * Edit intent emitted by `ImpGraphView`. Hosts route each edit to whichever source owns the
 * node or edge; `applyGraphEdits` covers a single local document.
 */
export type GraphEdit =
  | { kind: "addNode"; node: Node }
  | { kind: "updateNode"; nodeId: NodeId; patch: NodePatch }
  | { kind: "removeNode"; nodeId: NodeId }
  | { kind: "putEdge"; edgeId: EdgeId; edge: Edge }
  | { kind: "removeEdge"; edgeId: EdgeId }

function patchNode(node: Node, patch: NodePatch): Node {
  const next: Node = { ...node }
  if (patch.type !== undefined) next.type = patch.type
  if (patch.inputs !== undefined) next.inputs = patch.inputs
  if (patch.title === null) delete next.title
  else if (patch.title !== undefined) next.title = patch.title
  if (patch.typeArgs === null) delete next.typeArgs
  else if (patch.typeArgs !== undefined) next.typeArgs = patch.typeArgs
  return next
}

/**
 * Apply edits to a serialized document. Node edits for ids the document does not hold (nodes
 * another provider supplies) are skipped; the host routes those elsewhere.
 */
export function applyGraphEdits(graph: Graph, edits: readonly GraphEdit[]): Graph {
  if (edits.length === 0) return graph
  const nodes = { ...graph.nodes }
  const edges = { ...graph.edges }
  for (const edit of edits) {
    switch (edit.kind) {
      case "addNode":
        nodes[edit.node.id] = edit.node
        break
      case "updateNode": {
        const node = nodes[edit.nodeId]
        if (node) nodes[edit.nodeId] = patchNode(node, edit.patch)
        break
      }
      case "removeNode":
        delete nodes[edit.nodeId]
        break
      case "putEdge":
        edges[edit.edgeId] = edit.edge
        break
      case "removeEdge":
        delete edges[edit.edgeId]
        break
    }
  }
  return { nodes, edges }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function nodePatch(before: Node, after: Node): NodePatch | undefined {
  const patch: NodePatch = {}
  if (before.type !== after.type) patch.type = after.type
  if (before.title !== after.title) patch.title = after.title ?? null
  if (!sameJson(before.typeArgs, after.typeArgs)) patch.typeArgs = after.typeArgs ?? null
  if (!sameJson(before.inputs, after.inputs)) patch.inputs = after.inputs
  return Object.keys(patch).length > 0 ? patch : undefined
}

/** Edits that turn `before` into `after` (edge removals first, then nodes, then edge puts). */
export function diffGraphs(before: Graph, after: Graph): GraphEdit[] {
  const edits: GraphEdit[] = []
  for (const edgeId of Object.keys(before.edges)) {
    if (!(edgeId in after.edges)) edits.push({ kind: "removeEdge", edgeId })
  }
  for (const nodeId of Object.keys(before.nodes)) {
    if (!(nodeId in after.nodes)) edits.push({ kind: "removeNode", nodeId })
  }
  for (const [nodeId, node] of Object.entries(after.nodes)) {
    const prior = before.nodes[nodeId]
    if (!prior) {
      edits.push({ kind: "addNode", node })
      continue
    }
    const patch = nodePatch(prior, node)
    if (patch) edits.push({ kind: "updateNode", nodeId, patch })
  }
  for (const [edgeId, edge] of Object.entries(after.edges)) {
    const prior = before.edges[edgeId]
    if (!prior || !sameJson(prior, edge)) edits.push({ kind: "putEdge", edgeId, edge })
  }
  return edits
}
