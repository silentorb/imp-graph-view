import type { InputValues, Type } from "imp-core-types"

/** Imp instance fields stashed on React Flow `node.data` for round-trip. */
export interface ImpReactFlowNodeData extends Record<string, unknown> {
  inputValues: InputValues
  title?: string
  typeArgs?: Type[]
}
