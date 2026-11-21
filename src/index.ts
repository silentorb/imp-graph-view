export type { ImpReactFlowNodeData } from "./types"
export {
  impToReactFlow,
  reactFlowToImp,
  type ImpReactFlowNode,
  type ImpReactFlowEdge,
  type ReactFlowGraph,
} from "./convert"

export {
  withoutInboundToPort,
  dedupeInboundReactFlowEdges,
} from "./edit/inbound"
export { uniqueNodeId, uniqueEdgeId, uniqueNodeTitle } from "./edit/ids"
export { addImpNode } from "./edit/addNode"
export { setNodeTitle } from "./edit/setNodeTitle"
export {
  encodeSingletonHandle,
  encodeVariadicHandle,
  encodeDummyHandle,
  decodeHandle,
  canonicalPortId,
  isDummyHandle,
  type DecodedHandle,
} from "./edit/handles"
export {
  expandInputSlots,
  expandOutputSlots,
  nextVariadicOrder,
  reorderVariadicInputs,
  slotAcceptsConnect,
  type CatalogInputPort,
  type CatalogOutputPort,
  type InputSlot,
  type OutputSlot,
} from "./edit/slots"
export {
  expandEdgesForDisplay,
  collapseEdgesForImp,
  applyPreciseConnect,
  variadicPortKeys,
} from "./edit/displayEdges"
export { inferPortsFromEdges } from "./edit/inferPorts"
export {
  missingNodeIds,
  graphWithMissingStubs,
} from "./edit/missing"

export { ImpNode, type ImpNodeData, type ImpFlowNode } from "./components/ImpNode"
export {
  ImpGraphView,
  type ImpGraphViewProps,
  type GraphSelection,
  type ResolvePorts,
  type LayoutBox,
} from "./components/ImpGraphView"
export {
  layoutReadyForGraph,
  nodesMatchGraph,
  nodesReflectLayout,
} from "./layoutReady"
