import { describe, expect, test } from "bun:test"
import type { Graph } from "imp-core-types"
import {
  layoutReadyForGraph,
  nodesMatchGraph,
  nodesReflectLayout,
} from "./layoutReady"

const sampleGraph: Graph = {
  nodes: {
    a: { id: "a", type: "literal", inputs: {} },
    b: { id: "b", type: "filter", inputs: {} },
  },
  edges: {
    e1: {
      from: { node: "a", port: "value" },
      to: { node: "b", port: "predicate" },
    },
  },
}

describe("layoutReadyForGraph", () => {
  test("omitted layout is ready (host has no layout engine)", () => {
    expect(layoutReadyForGraph(undefined, sampleGraph)).toBe(true)
  })

  test("empty Map is not ready", () => {
    expect(layoutReadyForGraph(new Map(), sampleGraph)).toBe(false)
  })

  test("empty Record is not ready", () => {
    expect(layoutReadyForGraph({}, sampleGraph)).toBe(false)
  })

  test("Map with a graph node box is ready", () => {
    const layout = new Map([["a", { x: 10, y: 20 }]])
    expect(layoutReadyForGraph(layout, sampleGraph)).toBe(true)
  })

  test("Record with a graph node box is ready", () => {
    expect(
      layoutReadyForGraph({ b: { x: 0, y: 0, width: 120, height: 40 } }, sampleGraph),
    ).toBe(true)
  })

  test("box only for a dangling edge endpoint is ready", () => {
    const graph: Graph = {
      nodes: {
        a: { id: "a", type: "literal", inputs: {} },
      },
      edges: {
        e1: {
          from: { node: "a", port: "value" },
          to: { node: "missing", port: "in" },
        },
      },
    }
    const layout = new Map([["missing", { x: 100, y: 50 }]])
    expect(layoutReadyForGraph(layout, graph)).toBe(true)
  })

  test("unrelated layout ids do not count as ready", () => {
    const layout = new Map([["other", { x: 1, y: 2 }]])
    expect(layoutReadyForGraph(layout, sampleGraph)).toBe(false)
  })
})

describe("nodesReflectLayout", () => {
  test("omitted layout always reflects", () => {
    expect(
      nodesReflectLayout([{ id: "a", position: { x: 0, y: 0 } }], undefined),
    ).toBe(true)
  })

  test("false while nodes are still at origin before merge", () => {
    const layout = new Map([["a", { x: 40, y: 80 }]])
    expect(
      nodesReflectLayout([{ id: "a", position: { x: 0, y: 0 } }], layout),
    ).toBe(false)
  })

  test("true once a node position matches its layout box", () => {
    const layout = new Map([
      ["a", { x: 40, y: 80 }],
      ["b", { x: 200, y: 80 }],
    ])
    expect(
      nodesReflectLayout(
        [
          { id: "a", position: { x: 40, y: 80 } },
          { id: "b", position: { x: 0, y: 0 } },
        ],
        layout,
      ),
    ).toBe(true)
  })
})

describe("nodesMatchGraph", () => {
  test("false while flow nodes still belong to the previous graph", () => {
    expect(nodesMatchGraph([{ id: "old" }], sampleGraph)).toBe(false)
  })

  test("true when every graph node id is present", () => {
    expect(
      nodesMatchGraph([{ id: "a" }, { id: "b" }, { id: "stub" }], sampleGraph),
    ).toBe(true)
  })
})
