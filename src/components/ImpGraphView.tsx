import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from "react"
import {
  Background,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react"
import {
  materializeGraph,
  type Graph,
  type GraphSource,
  type PrimitiveValue,
  type SignalType,
} from "imp-core-types"
import { impToReactFlow, reactFlowToImp } from "../convert"
import {
  applyPreciseConnect,
  collapseEdgesForImp,
  expandEdgesForDisplay,
  variadicPortKeys,
} from "../edit/displayEdges"
import { diffGraphs, type GraphEdit } from "../edit/graphEdits"
import { UNRESOLVED_NODE_TYPE, unresolvedInGraph } from "../edit/unresolved"
import { setNodeInputLiteral } from "../edit/setNodeInputLiteral"
import { reorderVariadicInputs } from "../edit/slots"
import {
  expandInputSlots,
  expandOutputSlots,
  type CatalogInputPort,
  type CatalogOutputPort,
} from "../edit/slots"
import {
  layoutReadyForGraph,
  nodesMatchGraph,
  nodesReflectLayout,
} from "../layoutReady"
import { addImpNode } from "../edit/addNode"
import { rankByQuery } from "../search/rank"
import { SearchModal } from "../search/SearchModal"
import { ImpNode, type ImpFlowNode, type ImpNodeData } from "./ImpNode"

export type ResolvePorts = (
  nodeType: string,
  nodeId: string,
  edges: Edge[],
) => {
  inputs: CatalogInputPort[]
  outputs: CatalogOutputPort[]
}

export type LayoutBox = {
  x: number
  y: number
  width?: number
  height?: number
}

export type GraphSelection = {
  nodeIds: string[]
  edgeIds: string[]
}

/** A node type the add-node picker offers. `NodeDefinition` from imp-core-types fits. */
export type AddableNodeType = {
  id: string
  name?: string
}

/** Imperative controls for host commands and menus. */
export type ImpGraphViewHandle = {
  /**
   * Opens the add-node picker. The node lands under the pointer when it is over the canvas,
   * else at the canvas center. No-op when adding is unavailable.
   */
  openAddNode: () => void
}

export type ImpGraphViewProps = {
  ref?: Ref<ImpGraphViewHandle>
  /**
   * Edges plus a node provider. Every node the provider resolves renders as an ordinary card,
   * wherever it is stored; only unresolved endpoints render as stubs. Wrap a single document
   * with `graphSource(graph)`.
   */
  source: GraphSource
  /**
   * Edit intents for the host to route to whichever source owns each node or edge
   * (`applyGraphEdits` for a single document).
   */
  onEdit?: (edits: GraphEdit[]) => void
  resolvePorts: ResolvePorts
  layout?: ReadonlyMap<string, LayoutBox> | Record<string, LayoutBox>
  readOnly?: boolean
  nodesDraggable?: boolean
  colorMode?: "light" | "dark" | "system"
  nodeTypes?: NodeTypes
  className?: string
  style?: CSSProperties
  /**
   * Fit view when a new graph is loaded (default true).
   * If the host passes a layout map that is not yet ready, fit again when boxes arrive.
   * When `fitViewKey` is set, fit only when that key changes (not on every topology edit).
   * When unset, fit whenever the topology key changes (legacy).
   */
  fitViewOnLoad?: boolean
  /**
   * Host document/load identity. When provided, `fitViewOnLoad` triggers only when
   * this value changes (e.g. open / new tab), not on connect/undo topology edits.
   */
  fitViewKey?: string
  /** Session selection for host chrome (Properties pane, etc.). */
  onSelectionChange?: (selection: GraphSelection) => void
  /**
   * Fired when node positions settle (drag end). Hosts that persist layout
   * outside Imp (e.g. page-block fences) should store this map.
   */
  onLayoutChange?: (layout: Record<string, LayoutBox>) => void
  /**
   * Node types offered by the add-node picker (Shift+A over the canvas, double-click empty
   * canvas, the + control, or `ref.openAddNode()`). Adding is off when empty, `readOnly`, or
   * without `onEdit`. A new node emits an `addNode` edit plus an `onLayoutChange` placing it.
   */
  addableNodeTypes?: readonly AddableNodeType[]
}

const FIT_PADDING = 0.2

function layoutLookup(
  layout: ImpGraphViewProps["layout"],
  id: string,
): LayoutBox | undefined {
  if (!layout) return undefined
  if (layout instanceof Map) return layout.get(id)
  return (layout as Record<string, LayoutBox>)[id]
}

function scheduleFitView(
  fitView: (opts: { padding: number; maxZoom?: number }) => unknown,
  maxZoom?: number,
) {
  // Double rAF: wait until React Flow has committed the latest node positions.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void fitView(
        maxZoom === undefined ? { padding: FIT_PADDING } : { padding: FIT_PADDING, maxZoom },
      )
    })
  })
}

/** Topology key of a graph with no nodes or edges. */
const EMPTY_TOPOLOGY_KEY = "#"

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/** Double-clicks on empty canvas only — not on nodes, edges, or the controls. */
function isPaneTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls")) return false
  return target.closest(".react-flow__pane") !== null
}

function graphTopologyKey(graph: Graph): string {
  const nodeIds = Object.keys(graph.nodes).sort().join(",")
  const edgeKeys = Object.entries(graph.edges)
    .map(([id, e]) => {
      const order = e.order !== undefined ? `:${e.order}` : ""
      return `${id}:${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}${order}`
    })
    .sort()
    .join("|")
  return `${nodeIds}#${edgeKeys}`
}

/** Node payload key so title / typeArgs / inputs host edits rebuild RF data. */
function graphNodeContentKey(graph: Graph): string {
  return Object.keys(graph.nodes)
    .sort()
    .map((id) => {
      const node = graph.nodes[id]!
      const title = node.title ?? ""
      const typeArgs = node.typeArgs ? JSON.stringify(node.typeArgs) : ""
      const inputs = JSON.stringify(node.inputs)
      return `${id}:${node.type}:${title}:${typeArgs}:${inputs}`
    })
    .join("|")
}

function connectedInputPortsForNode(graph: Graph, nodeId: string): string[] {
  const ports: string[] = []
  const seen = new Set<string>()
  for (const edge of Object.values(graph.edges)) {
    if (edge.to.node === nodeId && !seen.has(edge.to.port)) {
      seen.add(edge.to.port)
      ports.push(edge.to.port)
    }
  }
  return ports
}

type FlowNodeCallbacks = {
  onReorderVariadic: ImpNodeData["onReorderVariadic"]
  onInputLiteralChange: ImpNodeData["onInputLiteralChange"]
  readOnly: boolean
}

function flowNodeFromParts(
  id: string,
  impType: string,
  inputValues: ImpNodeData["inputValues"],
  graph: Graph,
  edges: Edge[],
  resolvePorts: ResolvePorts,
  layout: ImpGraphViewProps["layout"],
  callbacks: FlowNodeCallbacks,
  prevSelected: Map<string, boolean>,
  unresolved: boolean,
  title?: string,
  typeArgs?: SignalType[],
): ImpFlowNode {
  const ports = resolvePorts(impType, id, edges)
  const inputSlots = expandInputSlots(ports.inputs, graph, id)
  const outputSlots = expandOutputSlots(ports.outputs)
  const box = layoutLookup(layout, id)
  const style: CSSProperties = {}
  if (box?.width != null) style.width = box.width
  if (box?.height != null) style.height = box.height
  return {
    id,
    type: "imp",
    position: box ? { x: box.x, y: box.y } : { x: 0, y: 0 },
    style: Object.keys(style).length ? style : undefined,
    selected: prevSelected.get(id) ?? false,
    data: {
      impType: unresolved ? UNRESOLVED_NODE_TYPE : impType,
      inputValues,
      inputSlots,
      outputSlots,
      title: unresolved ? undefined : title,
      typeArgs: unresolved ? undefined : typeArgs,
      unresolved: unresolved || undefined,
      connectedInputPorts: unresolved
        ? undefined
        : connectedInputPortsForNode(graph, id),
      readOnly: callbacks.readOnly,
      onReorderVariadic: callbacks.onReorderVariadic,
      onInputLiteralChange: callbacks.onInputLiteralChange,
    },
  }
}

function displayEdgesForGraph(
  graph: Graph,
  resolvePorts: ResolvePorts,
): Edge[] {
  const canonical = impToReactFlow(graph).edges as Edge[]
  const nodePorts = [
    ...Object.values(graph.nodes).map((node) => ({
      nodeId: node.id,
      inputs: resolvePorts(node.type, node.id, canonical).inputs,
    })),
    ...unresolvedInGraph(graph).map((id) => ({
      nodeId: id,
      inputs: resolvePorts(UNRESOLVED_NODE_TYPE, id, canonical).inputs,
    })),
  ]
  return expandEdgesForDisplay(canonical, variadicPortKeys(nodePorts))
}

function buildFlowNodes(
  graph: Graph,
  edges: Edge[],
  resolvePorts: ResolvePorts,
  layout: ImpGraphViewProps["layout"],
  callbacks: FlowNodeCallbacks,
  prevSelected: Map<string, boolean>,
): ImpFlowNode[] {
  const converted = impToReactFlow(graph)
  const nodes = converted.nodes.map((node) =>
    flowNodeFromParts(
      node.id,
      node.type ?? "",
      node.data.inputValues,
      graph,
      edges,
      resolvePorts,
      layout,
      callbacks,
      prevSelected,
      false,
      node.data.title,
      node.data.typeArgs,
    ),
  )

  // Unresolved edge endpoints must exist as RF nodes or React Flow blank-crashes.
  for (const id of unresolvedInGraph(graph)) {
    nodes.push(
      flowNodeFromParts(
        id,
        UNRESOLVED_NODE_TYPE,
        {},
        graph,
        edges,
        resolvePorts,
        layout,
        callbacks,
        prevSelected,
        true,
      ),
    )
  }
  return nodes
}

/**
 * Snapshot of the source as a serialized graph, stable across renders while its content is
 * unchanged (hosts may build a new `source` object every render).
 */
function useSourceSnapshot(source: GraphSource): Graph {
  const materialized = materializeGraph(source)
  const key = `${graphTopologyKey(materialized)}#${graphNodeContentKey(materialized)}`
  const ref = useRef<{ key: string; graph: Graph } | null>(null)
  if (ref.current?.key !== key) {
    ref.current = { key, graph: materialized }
  }
  return ref.current.graph
}

function ImpGraphViewInner({
  source,
  onEdit,
  resolvePorts,
  layout,
  readOnly = false,
  nodesDraggable = false,
  colorMode,
  nodeTypes: nodeTypesOverride,
  className,
  style,
  fitViewOnLoad = true,
  fitViewKey,
  onSelectionChange,
  onLayoutChange,
  addableNodeTypes,
  handleRef,
}: Omit<ImpGraphViewProps, "ref"> & { handleRef?: Ref<ImpGraphViewHandle> }) {
  const { fitView, screenToFlowPosition } = useReactFlow()
  const graph = useSourceSnapshot(source)
  const onEditRef = useRef(onEdit)
  onEditRef.current = onEdit
  /** Last graph the view synced from the source or emitted; edits are diffs against it. */
  const baseGraphRef = useRef<Graph>(graph)
  const emitGraph = useCallback((imp: Graph) => {
    const edits = diffGraphs(baseGraphRef.current, imp)
    baseGraphRef.current = imp
    if (edits.length > 0) onEditRef.current?.(edits)
  }, [])
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange
  const onLayoutChangeRef = useRef(onLayoutChange)
  onLayoutChangeRef.current = onLayoutChange

  const lastEmittedKey = useRef<string | null>(null)
  const lastContentKey = useRef<string | null>(null)
  const loadedKey = useRef<string | null>(null)
  const loadedFitKey = useRef<string | null>(null)
  const pendingFitRef = useRef(false)
  /** Zoom cap for the pending fit (an empty graph's first node should not fill the pane). */
  const pendingFitMaxZoomRef = useRef<number | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)

  const [nodes, setNodes] = useState<ImpFlowNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  /** Positions of nodes the picker placed, until the host layout covers them. */
  const placedRef = useRef(new Map<string, LayoutBox>())
  /** Node to select once the host echoes it back. */
  const pendingSelectRef = useRef<string | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const hoverRef = useRef(false)
  const [addOpen, setAddOpen] = useState(false)
  const addAtRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const toConverterNodes = useCallback((flowNodes: ImpFlowNode[]) => {
    // Unresolved stub cards are display-only — never emit them as nodes.
    return flowNodes
      .filter((n) => !n.data.unresolved)
      .map((n) => {
        const data: {
          inputValues: ImpNodeData["inputValues"]
          title?: string
          typeArgs?: SignalType[]
        } = {
          inputValues: n.data.inputValues,
        }
        if (n.data.title !== undefined) {
          data.title = n.data.title
        }
        if (n.data.typeArgs !== undefined) {
          data.typeArgs = n.data.typeArgs
        }
        return {
          id: n.id,
          type: n.data.impType,
          position: n.position,
          data,
        }
      })
  }, [])

  const emitImp = useCallback(
    (nextNodes: ImpFlowNode[], nextEdges: Edge[]) => {
      const collapsed = collapseEdgesForImp(nextEdges)
      const imp = reactFlowToImp(toConverterNodes(nextNodes), collapsed)
      lastEmittedKey.current = graphTopologyKey(imp)
      lastContentKey.current = graphNodeContentKey(imp)
      emitGraph(imp)
    },
    [emitGraph, toConverterNodes],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      onSelectionChangeRef.current?.({
        nodeIds: selectedNodes.map((n) => n.id),
        edgeIds: selectedEdges.map((e) => e.id),
      })
    },
    [],
  )

  const flowCallbacksRef = useRef<FlowNodeCallbacks>({
    onReorderVariadic: undefined,
    onInputLiteralChange: undefined,
    readOnly,
  })

  const onReorderVariadic = useCallback(
    (nodeId: string, portId: string, orderedEdgeIds: string[]) => {
      if (readOnly) return
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          const collapsed = collapseEdgesForImp(currentEdges)
          let imp: Graph
          try {
            imp = reorderVariadicInputs(
              reactFlowToImp(toConverterNodes(currentNodes), collapsed),
              nodeId,
              portId,
              orderedEdgeIds,
            )
          } catch {
            return currentEdges
          }
          lastEmittedKey.current = graphTopologyKey(imp)
          lastContentKey.current = graphNodeContentKey(imp)
          emitGraph(imp)

          const displayEdges = displayEdgesForGraph(imp, resolvePorts)
          const prevSelected = new Map(
            currentNodes.map((n) => [n.id, Boolean(n.selected)]),
          )
          queueMicrotask(() => {
            setEdges(displayEdges)
            setNodes(
              buildFlowNodes(
                imp,
                displayEdges,
                resolvePorts,
                layout,
                flowCallbacksRef.current,
                prevSelected,
              ),
            )
          })
          return displayEdges
        })
        return currentNodes
      })
    },
    [emitGraph, layout, readOnly, resolvePorts, toConverterNodes],
  )

  const onInputLiteralChange = useCallback(
    (
      nodeId: string,
      portId: string,
      value: PrimitiveValue | undefined,
    ) => {
      if (readOnly) return
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          const collapsed = collapseEdgesForImp(currentEdges)
          const current = reactFlowToImp(
            toConverterNodes(currentNodes),
            collapsed,
          )
          const imp = setNodeInputLiteral(current, nodeId, portId, value)
          if (imp === current) {
            return currentEdges
          }
          lastEmittedKey.current = graphTopologyKey(imp)
          lastContentKey.current = graphNodeContentKey(imp)
          emitGraph(imp)

          const displayEdges = displayEdgesForGraph(imp, resolvePorts)
          const prevSelected = new Map(
            currentNodes.map((n) => [n.id, Boolean(n.selected)]),
          )
          queueMicrotask(() => {
            setEdges(displayEdges)
            setNodes(
              buildFlowNodes(
                imp,
                displayEdges,
                resolvePorts,
                layout,
                flowCallbacksRef.current,
                prevSelected,
              ),
            )
          })
          return displayEdges
        })
        return currentNodes
      })
    },
    [emitGraph, layout, readOnly, resolvePorts, toConverterNodes],
  )

  flowCallbacksRef.current = {
    onReorderVariadic,
    onInputLiteralChange,
    readOnly,
  }

  // External graph / layout sync — skip echoes of our own emits.
  useEffect(() => {
    const topoKey = graphTopologyKey(graph)
    const contentKey = graphNodeContentKey(graph)
    if (
      topoKey === lastEmittedKey.current &&
      contentKey === lastContentKey.current
    ) {
      // Still merge layout positions without wiping selection.
      setNodes((current) =>
        current.map((n) => {
          const box = layoutLookup(layout, n.id)
          if (!box) return n
          const style: CSSProperties = { ...n.style }
          if (box.width != null) style.width = box.width
          if (box.height != null) style.height = box.height
          return {
            ...n,
            position: { x: box.x, y: box.y },
            style: Object.keys(style).length ? style : n.style,
          }
        }),
      )
      return
    }

    const topologyChanged = loadedKey.current !== topoKey
    const wasEmpty = loadedKey.current === EMPTY_TOPOLOGY_KEY
    loadedKey.current = topoKey
    baseGraphRef.current = graph
    lastEmittedKey.current = topoKey
    lastContentKey.current = contentKey

    const fitKeyChanged =
      fitViewKey !== undefined
        ? loadedFitKey.current !== fitViewKey
        : topologyChanged
    if (fitViewKey !== undefined) {
      loadedFitKey.current = fitViewKey
    }

    const displayEdges = displayEdgesForGraph(graph, resolvePorts)
    const selectId =
      pendingSelectRef.current && pendingSelectRef.current in graph.nodes
        ? pendingSelectRef.current
        : null
    if (selectId) pendingSelectRef.current = null
    for (const id of [...placedRef.current.keys()]) {
      if (!(id in graph.nodes) || layoutLookup(layout, id)) placedRef.current.delete(id)
    }
    const placed = new Map(placedRef.current)
    setNodes((current) => {
      const prevSelected = selectId
        ? new Map([[selectId, true]])
        : new Map(current.map((n) => [n.id, Boolean(n.selected)]))
      return buildFlowNodes(
        graph,
        displayEdges,
        resolvePorts,
        layout,
        flowCallbacksRef.current,
        prevSelected,
      ).map((n) => {
        const box = placed.get(n.id)
        return box ? { ...n, position: { x: box.x, y: box.y } } : n
      })
    })
    setEdges(displayEdges)

    const hasNodes = Object.keys(graph.nodes).length > 0
    if (fitViewOnLoad && fitKeyChanged && hasNodes) {
      // Fit only after a later render where `nodes` reflect ready layout (see below).
      pendingFitRef.current = true
      pendingFitMaxZoomRef.current = undefined
    } else if (fitViewOnLoad && wasEmpty && hasNodes) {
      // The canvas mounts fresh when an empty graph gets its first node; bring it into view.
      pendingFitRef.current = true
      pendingFitMaxZoomRef.current = 1
    } else if (fitKeyChanged) {
      pendingFitRef.current = false
    }
  }, [
    fitViewKey,
    fitViewOnLoad,
    graph,
    layout,
    onInputLiteralChange,
    onReorderVariadic,
    resolvePorts,
  ])

  // Fit after node state has laid-out positions — never in the same turn as setNodes.
  // If the pane is still 0×0 (hidden tab), keep pending and fit on resize.
  useEffect(() => {
    if (!pendingFitRef.current || !fitViewOnLoad) return
    if (!nodesMatchGraph(nodes, graph)) return
    if (layout !== undefined && !layoutReadyForGraph(layout, graph)) return
    if (!nodesReflectLayout(nodes, layout)) return

    const paneReady = () => {
      const el = rootRef.current
      return !!el && el.clientWidth > 0 && el.clientHeight > 0
    }

    const runFit = () => {
      if (!pendingFitRef.current) return
      if (!paneReady()) return
      pendingFitRef.current = false
      scheduleFitView(fitView, pendingFitMaxZoomRef.current)
    }

    runFit()
    if (!pendingFitRef.current) return

    const el = rootRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      runFit()
      if (!pendingFitRef.current) ro.disconnect()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitView, fitViewOnLoad, graph, layout, nodes])

  const nodeTypes = useMemo<NodeTypes>(
    () => nodeTypesOverride ?? { imp: ImpNode },
    [nodeTypesOverride],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<ImpFlowNode>[]) => {
      if (readOnly) {
        // Allow selection-only changes? Plan says select when editable.
        // In readOnly, ignore all.
        return
      }
      setNodes((current) => {
        const next = applyNodeChanges(changes, current)
        const structural = changes.some(
          (c) => c.type === "remove" || c.type === "add",
        )
        if (structural) {
          setEdges((currentEdges) => {
            emitImp(next, currentEdges)
            return currentEdges
          })
        }
        const dragEnded = changes.some(
          (c) => c.type === "position" && c.dragging === false,
        )
        if (dragEnded && onLayoutChangeRef.current) {
          const nextLayout: Record<string, LayoutBox> = {}
          for (const node of next) {
            if (node.data?.unresolved) continue
            nextLayout[node.id] = {
              x: node.position.x,
              y: node.position.y,
            }
          }
          onLayoutChangeRef.current(nextLayout)
        }
        return next
      })
    },
    [emitImp, readOnly],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (readOnly) return
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current)
        const structural = changes.some(
          (c) => c.type === "remove" || c.type === "add",
        )
        if (structural) {
          setNodes((currentNodes) => {
            emitImp(currentNodes, next)
            // Refresh slots after edge delete (variadic shrink).
            const collapsed = collapseEdgesForImp(next)
            const imp = reactFlowToImp(toConverterNodes(currentNodes), collapsed)
            const prevSelected = new Map(
              currentNodes.map((n) => [n.id, Boolean(n.selected)]),
            )
            queueMicrotask(() => {
              setNodes(
                buildFlowNodes(
                  imp,
                  next,
                  resolvePorts,
                  layout,
                  flowCallbacksRef.current,
                  prevSelected,
                ),
              )
            })
            return currentNodes
          })
        }
        return next
      })
    },
    [emitImp, layout, readOnly, resolvePorts, toConverterNodes],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return
      setEdges((current) => {
        const { edges: next, accepted } = applyPreciseConnect(
          current,
          connection,
        )
        if (!accepted) return current
        setNodes((currentNodes) => {
          emitImp(currentNodes, next)
          const collapsed = collapseEdgesForImp(next)
          const imp = reactFlowToImp(toConverterNodes(currentNodes), collapsed)
          const prevSelected = new Map(
            currentNodes.map((n) => [n.id, Boolean(n.selected)]),
          )
          queueMicrotask(() => {
            setNodes(
              buildFlowNodes(
                imp,
                next,
                resolvePorts,
                layout,
                flowCallbacksRef.current,
                prevSelected,
              ),
            )
          })
          return currentNodes
        })
        return next
      })
    },
    [emitImp, layout, readOnly, resolvePorts, toConverterNodes],
  )

  const empty =
    Object.keys(graph.nodes).length === 0 && Object.keys(graph.edges).length === 0
  const editable = !readOnly
  const canAdd = editable && onEdit !== undefined && (addableNodeTypes?.length ?? 0) > 0

  /** Opens the picker for a node at `at` (client coords), else under the pointer, else centered. */
  const openAddNode = useCallback(
    (at?: { x: number; y: number } | "center") => {
      if (!canAdd) return
      const root = rootRef.current
      let client: { x: number; y: number } | null =
        at === "center" || at === undefined ? null : at
      if (!client && at !== "center" && root && pointerRef.current) {
        const rect = root.getBoundingClientRect()
        const p = pointerRef.current
        if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) {
          client = p
        }
      }
      if (!client && root) {
        const rect = root.getBoundingClientRect()
        client = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
      // An empty graph has no mounted canvas to project onto; its first node goes at the origin.
      addAtRef.current = empty || !client ? { x: 0, y: 0 } : screenToFlowPosition(client)
      setAddOpen(true)
    },
    [canAdd, empty, screenToFlowPosition],
  )

  useImperativeHandle(handleRef, () => ({ openAddNode: () => openAddNode() }), [openAddNode])

  const addNode = useCallback(
    (typeId: string) => {
      const before = baseGraphRef.current
      const next = addImpNode(before, typeId)
      const id = Object.keys(next.nodes).find((nodeId) => !(nodeId in before.nodes))
      if (!id) return
      const box: LayoutBox = { ...addAtRef.current }
      placedRef.current.set(id, box)
      pendingSelectRef.current = id
      emitGraph(next)
      if (onLayoutChangeRef.current) {
        const nextLayout: Record<string, LayoutBox> = {}
        for (const node of nodesRef.current) {
          if (node.data?.unresolved) continue
          nextLayout[node.id] = { x: node.position.x, y: node.position.y }
        }
        nextLayout[id] = box
        onLayoutChangeRef.current(nextLayout)
      }
    },
    [emitGraph],
  )

  // Shift+A while the pointer is over this canvas or focus is inside it.
  useEffect(() => {
    if (!canAdd) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.toLowerCase() !== "a") return
      if (isTextEditingTarget(event.target)) return
      const root = rootRef.current
      if (!root) return
      if (!hoverRef.current && !root.contains(document.activeElement)) return
      event.preventDefault()
      openAddNode()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canAdd, openAddNode])

  const searchNodeTypes = useCallback(
    (query: string) =>
      rankByQuery(addableNodeTypes ?? [], query, (t) => [t.name || t.id, t.id]),
    [addableNodeTypes],
  )

  const rootProps = {
    ref: rootRef,
    className: className ? `imp-gv-root ${className}` : "imp-gv-root",
    style,
    onPointerMove: (event: { clientX: number; clientY: number }) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    },
    onPointerEnter: () => {
      hoverRef.current = true
    },
    onPointerLeave: () => {
      hoverRef.current = false
    },
  }

  const addNodePicker = (
    <SearchModal
      open={addOpen}
      onClose={() => setAddOpen(false)}
      search={searchNodeTypes}
      getKey={(t) => t.id}
      ariaLabel="Add node"
      placeholder="Add node…"
      emptyText={() => "No matching node types"}
      renderItem={(t) => (
        <>
          <span className="imp-gv-search-item-label">{t.name || t.id}</span>
          {t.name && t.name !== t.id ? (
            <span className="imp-gv-search-item-detail">{t.id}</span>
          ) : null}
        </>
      )}
      onActivate={(t) => addNode(t.id)}
    />
  )

  useEffect(() => {
    if (empty) {
      onSelectionChangeRef.current?.({ nodeIds: [], edgeIds: [] })
    }
  }, [empty])

  if (empty) {
    return (
      <div {...rootProps}>
        <div
          className="imp-gv-empty"
          onDoubleClick={canAdd ? () => openAddNode() : undefined}
        >
          {canAdd
            ? "Empty Imp graph — double-click or press Shift+A to add a node"
            : "Empty Imp graph"}
        </div>
        {addNodePicker}
      </div>
    )
  }

  return (
    <div
      {...rootProps}
      onDoubleClick={
        canAdd
          ? (event: ReactMouseEvent) => {
              if (isPaneTarget(event.target)) {
                openAddNode({ x: event.clientX, y: event.clientY })
              }
            }
          : undefined
      }
    >
      <ReactFlow
        className="imp-gv-flow"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={handleSelectionChange}
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        nodesDraggable={editable && nodesDraggable}
        nodesConnectable={editable}
        elementsSelectable={editable}
        edgesFocusable={editable}
        nodesFocusable={editable}
        panOnDrag
        zoomOnScroll
        zoomOnDoubleClick={!canAdd}
        proOptions={{ hideAttribution: true }}
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={0.1}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false}>
          {canAdd ? (
            <ControlButton
              onClick={() => openAddNode("center")}
              title="Add node (Shift+A)"
              aria-label="Add node"
            >
              +
            </ControlButton>
          ) : null}
        </Controls>
      </ReactFlow>
      {addNodePicker}
    </div>
  )
}

export function ImpGraphView({ ref, ...props }: ImpGraphViewProps) {
  return (
    <ReactFlowProvider>
      <ImpGraphViewInner {...props} handleRef={ref} />
    </ReactFlowProvider>
  )
}
