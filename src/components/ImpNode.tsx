import { memo, useCallback, type DragEvent } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { InputValues, SignalType } from "imp-core-types"
import type { InputSlot, OutputSlot } from "../edit/slots"

export type ImpNodeData = {
  impType: string
  inputValues: InputValues
  inputSlots: InputSlot[]
  outputSlots: OutputSlot[]
  /** Optional Imp display title; header falls back to node id. */
  title?: string
  /** Preserved Imp type arguments for round-trip. */
  typeArgs?: SignalType[]
  /** Present when this card is a dangling edge endpoint, not in Imp `Graph.nodes`. */
  missing?: boolean
  /** Reorder filled variadic siblings when a slot label is dropped. */
  onReorderVariadic?: (
    nodeId: string,
    portId: string,
    orderedEdgeIds: string[],
  ) => void
}

export type ImpFlowNode = Node<ImpNodeData>

function handleTop(index: number, count: number): string {
  if (count <= 1) {
    return "50%"
  }
  return `${((index + 1) / (count + 1)) * 100}%`
}

function ImpNodeComponent({ id, data }: NodeProps<ImpFlowNode>) {
  const inputCount = Math.max(data.inputSlots.length, 1)
  const outputCount = Math.max(data.outputSlots.length, 1)
  const rows = Math.max(data.inputSlots.length, data.outputSlots.length, 1)

  const onDragStart = useCallback(
    (event: DragEvent, edgeId: string, portId: string) => {
      event.dataTransfer.setData(
        "application/imp-variadic-reorder",
        JSON.stringify({ nodeId: id, portId, edgeId }),
      )
      event.dataTransfer.effectAllowed = "move"
    },
    [id],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    if (event.dataTransfer.types.includes("application/imp-variadic-reorder")) {
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
    }
  }, [])

  const onDrop = useCallback(
    (event: DragEvent, targetEdgeId: string, portId: string) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData("application/imp-variadic-reorder")
      if (!raw || !data.onReorderVariadic) return
      let payload: { nodeId: string; portId: string; edgeId: string }
      try {
        payload = JSON.parse(raw) as {
          nodeId: string
          portId: string
          edgeId: string
        }
      } catch {
        return
      }
      if (payload.nodeId !== id || payload.portId !== portId) return
      if (payload.edgeId === targetEdgeId) return

      const siblings = data.inputSlots.filter(
        (s): s is Extract<InputSlot, { kind: "variadic" }> =>
          s.kind === "variadic" && s.portId === portId,
      )
      const ids = siblings.map((s) => s.edgeId)
      const from = ids.indexOf(payload.edgeId)
      const to = ids.indexOf(targetEdgeId)
      if (from < 0 || to < 0) return
      const next = [...ids]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      data.onReorderVariadic(id, portId, next)
    },
    [data, id],
  )

  const typeLabel = data.missing
    ? "(missing)"
    : data.impType || "(unknown)"
  const headerLabel = data.missing
    ? "(missing)"
    : data.title?.trim()
      ? data.title
      : id

  return (
    <div
      className={data.missing ? "imp-gv-node imp-gv-node-missing" : "imp-gv-node"}
      style={{
        minHeight: 36 + rows * 18,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div className="imp-gv-node-header" title={headerLabel}>
        {headerLabel}
      </div>
      {!data.missing ? (
        <div className="imp-gv-node-type" title={typeLabel}>
          {typeLabel}
        </div>
      ) : null}
      <div className="imp-gv-ports">
        <div className="imp-gv-inputs">
          {data.inputSlots.map((slot) => (
            <div
              key={`in-label-${slot.handleId}`}
              className={
                slot.kind === "variadic"
                  ? "imp-gv-port-row imp-gv-port-row-variadic"
                  : "imp-gv-port-row"
              }
              draggable={slot.kind === "variadic"}
              onDragStart={
                slot.kind === "variadic"
                  ? (e) => onDragStart(e, slot.edgeId, slot.portId)
                  : undefined
              }
              onDragOver={slot.kind === "variadic" ? onDragOver : undefined}
              onDrop={
                slot.kind === "variadic"
                  ? (e) => onDrop(e, slot.edgeId, slot.portId)
                  : undefined
              }
            >
              {slot.label}
            </div>
          ))}
        </div>
        <div className="imp-gv-outputs">
          {data.outputSlots.map((slot) => (
            <div key={`out-label-${slot.handleId}`} className="imp-gv-port-row">
              {slot.label}
            </div>
          ))}
        </div>
      </div>
      {data.inputSlots.map((slot, index) => (
        <Handle
          key={`handle-in-${slot.handleId}`}
          className="imp-gv-handle"
          type="target"
          position={Position.Left}
          id={slot.handleId}
          isConnectable={slot.kind === "singleton" || slot.kind === "dummy"}
          style={{ top: handleTop(index, inputCount) }}
        />
      ))}
      {data.outputSlots.map((slot, index) => (
        <Handle
          key={`handle-out-${slot.handleId}`}
          className="imp-gv-handle"
          type="source"
          position={Position.Right}
          id={slot.handleId}
          style={{ top: handleTop(index, outputCount) }}
        />
      ))}
    </div>
  )
}

export const ImpNode = memo(ImpNodeComponent)
