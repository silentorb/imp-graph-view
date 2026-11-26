import { describe, expect, test } from "bun:test"
import type { Graph } from "imp-core-types"
import type { Edge as RfEdge } from "@xyflow/react"
import { concreteType, typeVar, unionOf } from "imp-core-types"
import { addImpNode } from "./addNode"
import {
  formatLiteralValue,
  isLiteralEditableType,
  parseLiteralText,
  shouldShowPortLiteralInput,
} from "./literals"
import { setNodeInputLiteral } from "./setNodeInputLiteral"
import { setNodeTitle } from "./setNodeTitle"
import {
  applyPreciseConnect,
  collapseEdgesForImp,
  expandEdgesForDisplay,
} from "./displayEdges"
import {
  canonicalPortId,
  decodeHandle,
  encodeDummyHandle,
  encodeVariadicHandle,
} from "./handles"
import { uniqueNodeId, uniqueNodeTitle } from "./ids"
import { dedupeInboundReactFlowEdges, withoutInboundToPort } from "./inbound"
import { inferPortsFromEdges } from "./inferPorts"
import { graphSource, layeredNodes, nodeMapProvider } from "imp-core-types"
import { applyGraphEdits, diffGraphs } from "./graphEdits"
import { graphWithUnresolvedStubs, unresolvedNodeIds } from "./unresolved"
import {
  expandInputSlots,
  nextVariadicOrder,
  reorderVariadicInputs,
} from "./slots"

describe("inbound helpers", () => {
  test("withoutInboundToPort drops matching target handle", () => {
    const edges = [
      { id: "a", target: "n", targetHandle: "x" },
      { id: "b", target: "n", targetHandle: "y" },
      { id: "c", target: "m", targetHandle: "x" },
    ]
    expect(withoutInboundToPort(edges, "n", "x").map((e) => e.id)).toEqual([
      "b",
      "c",
    ])
  })

  test("dedupeInboundReactFlowEdges keeps last per target handle", () => {
    const edges = [
      { id: "1", target: "n", targetHandle: "in" },
      { id: "2", target: "n", targetHandle: "in" },
      { id: "3", target: "n", targetHandle: "other" },
    ]
    expect(dedupeInboundReactFlowEdges(edges).map((e) => e.id)).toEqual([
      "2",
      "3",
    ])
  })
})

describe("ids and addImpNode", () => {
  test("uniqueNodeId increments", () => {
    let graph: Graph = { nodes: {}, edges: {} }
    graph = addImpNode(graph, "sine")
    expect(uniqueNodeId(graph, "sine")).toBe("sine_2")
    graph = addImpNode(graph, "sine")
    expect(uniqueNodeId(graph, "sine")).toBe("sine_3")
  })

  test("addImpNode inserts unique title and empty inputs", () => {
    const graph = addImpNode({ nodes: {}, edges: {} }, "parameter")
    expect(graph.nodes.parameter).toEqual({
      id: "parameter",
      title: "parameter",
      type: "parameter",
      inputs: {},
    })
  })

  test("uniqueNodeTitle skips nodes without titles", () => {
    const graph: Graph = {
      nodes: {
        a: { id: "a", type: "sine", inputs: {} },
        b: { id: "b", title: "sine", type: "sine", inputs: {} },
      },
      edges: {},
    }
    expect(uniqueNodeTitle(graph, "sine")).toBe("sine_2")
  })
})

describe("setNodeTitle", () => {
  test("sets trims and clears title", () => {
    let graph: Graph = {
      nodes: {
        a: { id: "a", title: "Old", type: "sine", inputs: {} },
      },
      edges: {},
    }
    graph = setNodeTitle(graph, "a", "  New  ")
    expect(graph.nodes.a?.title).toBe("New")
    graph = setNodeTitle(graph, "a", "   ")
    expect(graph.nodes.a?.title).toBeUndefined()
    expect("title" in (graph.nodes.a ?? {})).toBe(false)
  })

  test("returns same graph for missing node", () => {
    const graph: Graph = { nodes: {}, edges: {} }
    expect(setNodeTitle(graph, "missing", "x")).toBe(graph)
  })
})

describe("setNodeInputLiteral", () => {
  test("sets clears and stores null", () => {
    let graph: Graph = {
      nodes: {
        a: { id: "a", type: "parameter", inputs: {} },
      },
      edges: {},
    }
    graph = setNodeInputLiteral(graph, "a", "label", "gain")
    expect(graph.nodes.a?.inputs.label).toBe("gain")
    graph = setNodeInputLiteral(graph, "a", "value", null)
    expect(graph.nodes.a?.inputs.value).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(graph.nodes.a?.inputs, "value")).toBe(
      true,
    )
    graph = setNodeInputLiteral(graph, "a", "value", undefined)
    expect(
      Object.prototype.hasOwnProperty.call(graph.nodes.a?.inputs, "value"),
    ).toBe(false)
  })

  test("returns same graph for missing node or no-op", () => {
    const graph: Graph = {
      nodes: {
        a: { id: "a", type: "parameter", inputs: { label: "x" } },
      },
      edges: {},
    }
    expect(setNodeInputLiteral(graph, "missing", "label", "y")).toBe(graph)
    expect(setNodeInputLiteral(graph, "a", "label", "x")).toBe(graph)
    expect(setNodeInputLiteral(graph, "a", "missing", undefined)).toBe(graph)
  })
})

describe("literal helpers", () => {
  test("isLiteralEditableType hides containers", () => {
    expect(isLiteralEditableType(concreteType("string"))).toBe(true)
    expect(isLiteralEditableType(concreteType("any"))).toBe(true)
    expect(isLiteralEditableType(typeVar("T"))).toBe(true)
    expect(isLiteralEditableType(undefined)).toBe(true)
    expect(isLiteralEditableType(concreteType("list"))).toBe(false)
    expect(isLiteralEditableType(concreteType("collection"))).toBe(false)
    expect(isLiteralEditableType(unionOf(concreteType("string"), concreteType("number")))).toBe(true)
    expect(isLiteralEditableType(unionOf(concreteType("string"), concreteType("list")))).toBe(false)
  })

  test("shouldShowPortLiteralInput requires unconnected singleton", () => {
    expect(
      shouldShowPortLiteralInput(
        { type: concreteType("string") },
        [],
        "label",
      ),
    ).toBe(true)
    expect(
      shouldShowPortLiteralInput(
        { type: concreteType("string") },
        ["label"],
        "label",
      ),
    ).toBe(false)
    expect(
      shouldShowPortLiteralInput(
        { variadic: true, type: concreteType("any") },
        [],
        "items",
      ),
    ).toBe(false)
  })

  test("format and parse round-trip common cases", () => {
    expect(formatLiteralValue(undefined)).toBe("")
    expect(formatLiteralValue(null)).toBe("")
    expect(formatLiteralValue(12)).toBe("12")
    expect(parseLiteralText("3.5", concreteType("number"))).toBe(3.5)
    expect(parseLiteralText("", concreteType("number"))).toBeUndefined()
    expect(parseLiteralText("hi", concreteType("string"))).toBe("hi")
    expect(parseLiteralText("true", concreteType("any"))).toBe(true)
    expect(parseLiteralText("null", concreteType("any"))).toBeNull()
  })
})

describe("handles", () => {
  test("encodes and decodes variadic and dummy", () => {
    expect(decodeHandle("freq")).toEqual({ kind: "port", portId: "freq" })
    expect(decodeHandle(encodeVariadicHandle("items", 2))).toEqual({
      kind: "variadic",
      portId: "items",
      order: 2,
    })
    expect(decodeHandle(encodeDummyHandle("items"))).toEqual({
      kind: "dummy",
      portId: "items",
    })
    expect(canonicalPortId(encodeVariadicHandle("items", 1))).toBe("items")
  })
})

describe("slots and order", () => {
  const graph: Graph = {
    nodes: {
      a: { id: "a", type: "parameter", inputs: {} },
      b: { id: "b", type: "parameter", inputs: {} },
      pack: { id: "pack", type: "pack", inputs: {} },
    },
    edges: {
      e0: {
        from: { node: "a", port: "value" },
        to: { node: "pack", port: "items" },
        order: 0,
      },
      e1: {
        from: { node: "b", port: "value" },
        to: { node: "pack", port: "items" },
        order: 1,
      },
    },
  }

  test("expandInputSlots adds filled + dummy for variadic", () => {
    const slots = expandInputSlots(
      [{ id: "items", variadic: true }],
      graph,
      "pack",
    )
    expect(slots.map((s) => s.kind)).toEqual(["variadic", "variadic", "dummy"])
    expect(slots[0]).toMatchObject({ edgeId: "e0", order: 0 })
    expect(slots[2]?.handleId).toBe(encodeDummyHandle("items"))
  })

  test("nextVariadicOrder continues after max", () => {
    expect(nextVariadicOrder(graph, "pack", "items")).toBe(2)
  })

  test("reorderVariadicInputs rewrites 0..n-1", () => {
    const next = reorderVariadicInputs(graph, "pack", "items", ["e1", "e0"])
    expect(next.edges.e1?.order).toBe(0)
    expect(next.edges.e0?.order).toBe(1)
  })
})

describe("unresolved endpoints", () => {
  test("unresolvedNodeIds lists endpoints no provider supplies", () => {
    const graph: Graph = {
      nodes: {
        b: { id: "b", type: "loop", inputs: {} },
      },
      edges: {
        e1: {
          from: { node: "ghost", port: "score" },
          to: { node: "b", port: "value" },
        },
      },
    }
    expect(unresolvedNodeIds(graphSource(graph))).toEqual(["ghost"])
    const remote = nodeMapProvider({ ghost: { id: "ghost", type: "notation", inputs: {} } })
    const layered = { ...graphSource(graph), nodes: layeredNodes(graphSource(graph).nodes, remote) }
    expect(unresolvedNodeIds(layered)).toEqual([])
    expect(graphWithUnresolvedStubs(graphSource(graph)).nodes.ghost?.type).toBe("(unresolved)")
    expect(graphWithUnresolvedStubs(layered).nodes.ghost?.type).toBe("notation")
  })
})

describe("graph edits", () => {
  const before: Graph = {
    nodes: {
      a: { id: "a", type: "literal", title: "A", inputs: { value: 1 } },
      b: { id: "b", type: "output", inputs: {} },
    },
    edges: { e1: { from: { node: "a", port: "value" }, to: { node: "b", port: "value" } } },
  }

  test("diffGraphs round-trips through applyGraphEdits", () => {
    const after: Graph = {
      nodes: {
        a: { id: "a", type: "literal", inputs: { value: 2 } },
        c: { id: "c", type: "literal", inputs: {} },
      },
      edges: { e2: { from: { node: "c", port: "value" }, to: { node: "a", port: "value" } } },
    }
    const edits = diffGraphs(before, after)
    expect(edits.map((e) => e.kind)).toEqual([
      "removeEdge",
      "removeNode",
      "updateNode",
      "addNode",
      "putEdge",
    ])
    expect(applyGraphEdits(before, edits)).toEqual(after)
  })

  test("no changes yields no edits and the same graph", () => {
    expect(diffGraphs(before, before)).toEqual([])
    expect(applyGraphEdits(before, [])).toBe(before)
  })

  test("edits to nodes the document does not hold are skipped", () => {
    const next = applyGraphEdits(before, [
      { kind: "updateNode", nodeId: "remote", patch: { title: "x" } },
    ])
    expect(next.nodes.remote).toBeUndefined()
  })
})

describe("inferPortsFromEdges", () => {
  test("single inbound without order is singleton", () => {
    const edges: RfEdge[] = [
      {
        id: "e1",
        source: "a",
        target: "b",
        sourceHandle: "out",
        targetHandle: "value",
      },
    ]
    expect(inferPortsFromEdges("b", edges).inputs).toEqual([
      { id: "value", variadic: false },
    ])
  })

  test("multi inbound or ordered inbound is variadic", () => {
    const multi: RfEdge[] = [
      {
        id: "e1",
        source: "a",
        target: "mix",
        sourceHandle: "out",
        targetHandle: "inputs",
      },
      {
        id: "e2",
        source: "b",
        target: "mix",
        sourceHandle: "out",
        targetHandle: "inputs",
      },
    ]
    expect(inferPortsFromEdges("mix", multi).inputs).toEqual([
      { id: "inputs", variadic: true },
    ])

    const ordered: RfEdge[] = [
      {
        id: "e1",
        source: "a",
        target: "mix",
        sourceHandle: "out",
        targetHandle: "inputs",
        data: { order: 0 },
      },
    ]
    expect(inferPortsFromEdges("mix", ordered).inputs).toEqual([
      { id: "inputs", variadic: true },
    ])
  })
})

describe("precise connect", () => {
  test("singleton replace drops prior inbound", () => {
    const edges: RfEdge[] = [
      {
        id: "old",
        source: "a",
        target: "b",
        sourceHandle: "value",
        targetHandle: "freq",
      },
    ]
    const { edges: next, accepted } = applyPreciseConnect(edges, {
      source: "c",
      target: "b",
      sourceHandle: "value",
      targetHandle: "freq",
    })
    expect(accepted).toBe(true)
    expect(next).toHaveLength(1)
    expect(next[0]?.source).toBe("c")
    expect(next[0]?.targetHandle).toBe("freq")
  })

  test("variadic dummy appends with order", () => {
    const edges: RfEdge[] = [
      {
        id: "e0",
        source: "a",
        target: "pack",
        sourceHandle: "value",
        targetHandle: encodeVariadicHandle("items", 0),
        data: { order: 0 },
      },
    ]
    const { edges: next, accepted } = applyPreciseConnect(edges, {
      source: "b",
      target: "pack",
      sourceHandle: "value",
      targetHandle: encodeDummyHandle("items"),
    })
    expect(accepted).toBe(true)
    expect(next).toHaveLength(2)
    const added = next.find((e) => e.id !== "e0")
    expect(added?.data).toEqual({ order: 1 })
    expect(added?.targetHandle).toBe(encodeVariadicHandle("items", 1))
  })

  test("filled variadic slot rejects connect", () => {
    const { accepted } = applyPreciseConnect([], {
      source: "a",
      target: "pack",
      sourceHandle: "value",
      targetHandle: encodeVariadicHandle("items", 0),
    })
    expect(accepted).toBe(false)
  })

  test("expand and collapse display edges preserve order", () => {
    const edges: RfEdge[] = [
      {
        id: "e0",
        source: "a",
        target: "pack",
        sourceHandle: "value",
        targetHandle: "items",
        data: { order: 0 },
      },
    ]
    const display = expandEdgesForDisplay(edges)
    expect(display[0]?.targetHandle).toBe(encodeVariadicHandle("items", 0))
    const collapsed = collapseEdgesForImp(display)
    expect(collapsed[0]?.targetHandle).toBe("items")
    expect(collapsed[0]?.data).toEqual({ order: 0 })
  })
})
