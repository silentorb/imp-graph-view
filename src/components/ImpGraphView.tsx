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
} from "@xyflow/react"
import type { Graph } from "imp-core-types"
import { impToReactFlow, reactFlowToImp } from "../convert"
import {
  applyPreciseConnect,
  collapseEdgesForImp,
  expandEdgesForDisplay,
  variadicPortKeys,
} from "../edit/displayEdges"
import { missingNodeIds } from "../edit/missing"
import { reorderVariadicInputs } from "../edit/slots"
import {
  expandInputSlots,
  expandOutputSlots,
  type CatalogInputPort,
  type CatalogOutputPort,
} from "../edit/slots"
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

export type ImpGraphViewProps = {
  graph: Graph
  onGraphChange?: (graph: Graph) => void
  resolvePorts: ResolvePorts
  layout?: ReadonlyMap<string, LayoutBox> | Record<string, LayoutBox>
  readOnly?: boolean
  nodesDraggable?: boolean
  colorMode?: "light" | "dark" | "system"
  nodeTypes?: NodeTypes
  className?: string
  style?: CSSProperties
  /** Fit view when a new document identity is loaded (default true). */
  fitViewOnLoad?: boolean
}

function layoutLookup(
  layout: ImpGraphViewProps["layout"],
  id: string,
): LayoutBox | undefined {
  if (!layout) return undefined
  if (layout instanceof Map) return layout.get(id)
  return (layout as Record<string, LayoutBox>)[id]
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

function flowNodeFromParts(
  id: string,
  impType: string,
  inputValues: ImpNodeData["inputValues"],
  graph: Graph,
  edges: Edge[],
  resolvePorts: ResolvePorts,
  layout: ImpGraphViewProps["layout"],
  onReorderVariadic: ImpNodeData["onReorderVariadic"],
  prevSelected: Map<string, boolean>,
  missing: boolean,
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
      impType: missing ? "(missing)" : impType,
      inputValues,
      inputSlots,
      outputSlots,
      missing: missing || undefined,
      onReorderVariadic,
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
    ...missingNodeIds(graph).map((id) => ({
      nodeId: id,
      inputs: resolvePorts("(missing)", id, canonical).inputs,
    })),
  ]
  return expandEdgesForDisplay(canonical, variadicPortKeys(nodePorts))
}

function buildFlowNodes(
  graph: Graph,
  edges: Edge[],
  resolvePorts: ResolvePorts,
  layout: ImpGraphViewProps["layout"],
  onReorderVariadic: ImpNodeData["onReorderVariadic"],
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
      onReorderVariadic,
      prevSelected,
      false,
    ),
  )

  // Dangling edge endpoints must exist as RF nodes or React Flow blank-crashes.
  for (const id of missingNodeIds(graph)) {
    nodes.push(
      flowNodeFromParts(
        id,
        "(missing)",
        {},
        graph,
        edges,
        resolvePorts,
        layout,
        onReorderVariadic,
        prevSelected,
        true,
      ),
    )
  }
  return nodes
}

function ImpGraphViewInner({
  graph,
  onGraphChange,
  resolvePorts,
  layout,
  readOnly = false,
  nodesDraggable = false,
  colorMode,
  nodeTypes: nodeTypesOverride,
  className,
  style,
  fitViewOnLoad = true,
}: ImpGraphViewProps) {
  const { fitView } = useReactFlow()
  const onGraphChangeRef = useRef(onGraphChange)
  onGraphChangeRef.current = onGraphChange

  const lastEmittedKey = useRef<string | null>(null)
  const loadedKey = useRef<string | null>(null)

  const [nodes, setNodes] = useState<ImpFlowNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const toConverterNodes = useCallback((flowNodes: ImpFlowNode[]) => {
    // Missing stub cards are display-only — never write them into Imp Graph.nodes.
    return flowNodes
      .filter((n) => !n.data.missing)
      .map((n) => ({
        id: n.id,
        type: n.data.impType,
        position: n.position,
        data: { inputValues: n.data.inputValues },
      }))
  }, [])

  const emitImp = useCallback(
    (nextNodes: ImpFlowNode[], nextEdges: Edge[]) => {
      const collapsed = collapseEdgesForImp(nextEdges)
      const imp = reactFlowToImp(toConverterNodes(nextNodes), collapsed)
      const key = graphTopologyKey(imp)
      lastEmittedKey.current = key
      onGraphChangeRef.current?.(imp)
    },
    [toConverterNodes],
  )

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
          onGraphChangeRef.current?.(imp)

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
                onReorderVariadic,
                prevSelected,
              ),
            )
          })
          return displayEdges
        })
        return currentNodes
      })
    },
    [layout, readOnly, resolvePorts, toConverterNodes],
  )

  // External graph / layout sync — skip echoes of our own emits.
  useEffect(() => {
    const key = graphTopologyKey(graph)
    if (key === lastEmittedKey.current) {
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

    const isNewLoad = loadedKey.current !== key
    loadedKey.current = key
    lastEmittedKey.current = key

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
        onReorderVariadic,
        prevSelected,
      )
    })
    setEdges(displayEdges)

    if (fitViewOnLoad && isNewLoad && Object.keys(graph.nodes).length > 0) {
      queueMicrotask(() => {
        void fitView({ padding: 0.2 })
      })
    }
  }, [fitView, fitViewOnLoad, graph, layout, onReorderVariadic, resolvePorts])

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
                  onReorderVariadic,
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
    [emitImp, layout, onReorderVariadic, readOnly, resolvePorts, toConverterNodes],
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
                onReorderVariadic,
                prevSelected,
              ),
            )
          })
          return currentNodes
        })
        return next
      })
    },
    [emitImp, layout, onReorderVariadic, readOnly, resolvePorts, toConverterNodes],
  )

  const empty = Object.keys(graph.nodes).length === 0
  const editable = !readOnly

  if (empty) {
    return (
      <div className={className ? `imp-gv-root ${className}` : "imp-gv-root"} style={style}>
        <div className="imp-gv-empty">Empty Imp graph</div>
      </div>
    )
  }

  return (
    <div className={className ? `imp-gv-root ${className}` : "imp-gv-root"} style={style}>
      <ReactFlow
        className="imp-gv-flow"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        nodesDraggable={editable && nodesDraggable}
        nodesConnectable={editable}
        elementsSelectable={editable}
        edgesFocusable={editable}
        nodesFocusable={editable}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        fitViewOptions={{ padding: 0.2 }}
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
