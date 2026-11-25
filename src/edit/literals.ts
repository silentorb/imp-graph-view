import {
  isConcreteType,
  isTypeVar,
  type PrimitiveValue,
  type Type,
} from "imp-core-types"
import type { CatalogInputPort } from "./slots"

/** Concrete container signal ids that cannot be edited as a PrimitiveValue. */
const NON_SCALAR_TYPE_IDS = new Set([
  "collection",
  "list",
  "set",
])

/**
 * Whether a port's type can have an on-node / Properties literal editor.
 * Type-vars and `any` are editable; concrete container types are not.
 */
export function isLiteralEditableType(
  type: Type | undefined,
): boolean {
  if (type == null) {
    // Host omitted type metadata — still allow a generic text editor.
    return true
  }
  if (isTypeVar(type)) {
    return true
  }
  if (!isConcreteType(type)) {
    return false
  }
  return !NON_SCALAR_TYPE_IDS.has(type.id)
}

/**
 * On-node visibility: singleton, unconnected, and literal-editable type.
 * Variadic ports never show literals.
 */
export function shouldShowPortLiteralInput(
  port: Pick<CatalogInputPort, "variadic" | "type">,
  connectedInputPorts: readonly string[],
  portId: string,
): boolean {
  if (port.variadic === true) {
    return false
  }
  if (connectedInputPorts.includes(portId)) {
    return false
  }
  return isLiteralEditableType(port.type)
}

/** Format a stored literal for a text field. */
export function formatLiteralValue(
  value: PrimitiveValue | undefined,
): string {
  if (value === undefined || value === null) {
    return ""
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  return String(value)
}

/**
 * Parse a text field into a PrimitiveValue for the given signal kind.
 * Empty string: clears (`undefined`) for number; `""` for string; heuristic for any.
 */
export function parseLiteralText(
  raw: string,
  type: Type | undefined,
): PrimitiveValue | undefined {
  const kind = literalEditorKind(type)
  if (kind === "number") {
    const trimmed = raw.trim()
    if (trimmed === "") {
      return undefined
    }
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : undefined
  }
  if (kind === "string") {
    return raw
  }
  // any / type-var / unknown — Tome-style heuristic
  if (raw === "true") return true
  if (raw === "false") return false
  if (raw === "null") return null
  const trimmed = raw.trim()
  if (trimmed === "") {
    return ""
  }
  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
    return asNumber
  }
  return raw
}

export type LiteralEditorKind = "string" | "number" | "boolean" | "any"

export function literalEditorKind(
  type: Type | undefined,
): LiteralEditorKind {
  if (type == null || isTypeVar(type)) {
    return "any"
  }
  if (isConcreteType(type)) {
    if (type.id === "string") return "string"
    if (type.id === "number") return "number"
    if (type.id === "boolean") return "boolean"
  }
  return "any"
}
