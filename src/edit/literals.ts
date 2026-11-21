import {
  isConcreteSignalType,
  isTypeVar,
  type PrimitiveValue,
  type SignalType,
} from "imp-core-types"
import type { CatalogInputPort } from "./slots"

/** Concrete container signal ids that cannot be edited as a PrimitiveValue. */
const NON_SCALAR_SIGNAL_IDS = new Set([
  "collection",
  "list",
  "set",
])

/**
 * Whether a port's signal type can have an on-node / Properties literal editor.
 * Type-vars and `any` are editable; concrete container types are not.
 */
export function isLiteralEditableSignalType(
  signalType: SignalType | undefined,
): boolean {
  if (signalType == null) {
    // Host omitted type metadata — still allow a generic text editor.
    return true
  }
  if (isTypeVar(signalType)) {
    return true
  }
  if (!isConcreteSignalType(signalType)) {
    return false
  }
  return !NON_SCALAR_SIGNAL_IDS.has(signalType.id)
}

/**
 * On-node visibility: singleton, unconnected, and literal-editable signal type.
 * Variadic ports never show literals.
 */
export function shouldShowPortLiteralInput(
  port: Pick<CatalogInputPort, "variadic" | "signalType">,
  connectedInputPorts: readonly string[],
  portId: string,
): boolean {
  if (port.variadic === true) {
    return false
  }
  if (connectedInputPorts.includes(portId)) {
    return false
  }
  return isLiteralEditableSignalType(port.signalType)
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
  signalType: SignalType | undefined,
): PrimitiveValue | undefined {
  const kind = literalEditorKind(signalType)
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
  signalType: SignalType | undefined,
): LiteralEditorKind {
  if (signalType == null || isTypeVar(signalType)) {
    return "any"
  }
  if (isConcreteSignalType(signalType)) {
    if (signalType.id === "string") return "string"
    if (signalType.id === "number") return "number"
    if (signalType.id === "boolean") return "boolean"
  }
  return "any"
}
