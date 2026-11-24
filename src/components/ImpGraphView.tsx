import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  Background,
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

export type ImpGraphViewProps = {
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

function scheduleFitView(fitView: (opts: { padding: number }) => unknown) {
  // Double rAF: wait until React Flow has committed the latest node positions.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void fitView({ padding: FIT_PADDING })
    })
  })
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
}: ImpGraphViewProps) {
  const { fitView } = useReactFlow()
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
  const rootRef = useRef<HTMLDivElement>(null)

  const [nodes, setNodes] = useState<ImpFlowNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

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
    setNodes((current) => {
      const prevSelected = new Map(
        current.map((n) => [n.id, Boolean(n.selected)]),
      )
      return buildFlowNodes(
        graph,
        displayEdges,
        resolvePorts,
        layout,
        flowCallbacksRef.current,
        prevSelected,
      )
    })
    setEdges(displayEdges)

    if (fitViewOnLoad && fitKeyChanged && Object.keys(graph.nodes).length > 0) {
      // Fit only after a later render where `nodes` reflect ready layout (see below).
      pendingFitRef.current = true
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
      scheduleFitView(fitView)
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

  useEffect(() => {
    if (empty) {
      onSelectionChangeRef.current?.({ nodeIds: [], edgeIds: [] })
    }
  }, [empty])

  if (empty) {
    return (
      <div
        ref={rootRef}
        className={className ? `imp-gv-root ${className}` : "imp-gv-root"}
        style={style}
      >
        <div className="imp-gv-empty">Empty Imp graph</div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={className ? `imp-gv-root ${className}` : "imp-gv-root"}
      style={style}
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
        proOptions={{ hideAttribution: true }}
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={0.1}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function ImpGraphView(props: ImpGraphViewProps) {
  return (
    <ReactFlowProvider>
      <ImpGraphViewInner {...props} />
    </ReactFlowProvider>
  )
}
