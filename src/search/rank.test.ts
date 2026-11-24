import { describe, expect, test } from "bun:test"
import { rankByQuery } from "./rank"

type T = { id: string; name?: string }
const texts = (t: T) => [t.name || t.id, t.id]
const ids = (items: T[]) => items.map((t) => t.id)

const types: T[] = [
  { id: "osc_sine" },
  { id: "sine" },
  { id: "sine_fold" },
  { id: "gain" },
  { id: "LowPass", name: "Low-pass filter" },
  { id: "business" },
]

describe("rankByQuery", () => {
  test("empty query lists everything alphabetically by label", () => {
    expect(ids(rankByQuery(types, "  ", texts))).toEqual([
      "business",
      "gain",
      "LowPass",
      "osc_sine",
      "sine",
      "sine_fold",
    ])
  })

  test("exact, then prefix, then word start, then substring", () => {
    expect(ids(rankByQuery(types, "sine", texts))).toEqual([
      "sine",
      "sine_fold",
      "osc_sine",
      "business",
    ])
  })

  test("matches either name or id, case-insensitively", () => {
    expect(ids(rankByQuery(types, "FILTER", texts))).toEqual(["LowPass"])
    expect(ids(rankByQuery(types, "pass", texts))).toEqual(["LowPass"])
  })

  test("camel-case boundaries count as word starts", () => {
    const camel: T[] = [{ id: "bypass" }, { id: "LowPass" }]
    expect(ids(rankByQuery(camel, "pass", (t) => [t.id]))).toEqual(["LowPass", "bypass"])
  })

  test("in-order letters match last", () => {
    expect(ids(rankByQuery(types, "osn", texts))).toEqual(["osc_sine"])
  })

  test("no match drops the item", () => {
    expect(rankByQuery(types, "zzz", texts)).toEqual([])
  })
})
