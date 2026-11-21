/**
 * Display handle encoding for Precise variadic slots.
 *
 * Converters keep Imp port ids on edges. The view expands variadic fan-in to
 * unique RF handle ids, then collapses on emit.
 *
 * - singleton / output: bare `portId`
 * - variadic filled: `portId::order`
 * - variadic dummy: `portId::+`
 */

export type DecodedHandle =
  | { kind: "port"; portId: string }
  | { kind: "variadic"; portId: string; order: number }
  | { kind: "dummy"; portId: string }

const SEP = "::"
const DUMMY = "+"

export function encodeSingletonHandle(portId: string): string {
  return portId
}

export function encodeVariadicHandle(portId: string, order: number): string {
  return `${portId}${SEP}${order}`
}

export function encodeDummyHandle(portId: string): string {
  return `${portId}${SEP}${DUMMY}`
}

export function decodeHandle(handleId: string | null | undefined): DecodedHandle | null {
  if (handleId == null || handleId === "") {
    return null
  }
  const sep = handleId.lastIndexOf(SEP)
  if (sep < 0) {
    return { kind: "port", portId: handleId }
  }
  const portId = handleId.slice(0, sep)
  const suffix = handleId.slice(sep + SEP.length)
  if (suffix === DUMMY) {
    return { kind: "dummy", portId }
  }
  if (/^\d+$/.test(suffix)) {
    return { kind: "variadic", portId, order: Number(suffix) }
  }
  // Treat unknown suffixes as bare port ids (no false collapse).
  return { kind: "port", portId: handleId }
}

/** Imp catalog port id for an RF handle (dummy / ordered slots → base port). */
export function canonicalPortId(handleId: string | null | undefined): string | null {
  const decoded = decodeHandle(handleId)
  return decoded?.portId ?? null
}

export function isDummyHandle(handleId: string | null | undefined): boolean {
  return decodeHandle(handleId)?.kind === "dummy"
}
