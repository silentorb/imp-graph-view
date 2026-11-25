# imp-graph-view — agent notes

## What it is

**Imp React graph view** — bidirectional Imp `Graph` ↔ React Flow converters **plus** an editable Precise RF canvas (`ImpGraphView`, `ImpNode`).

Peers: `react`, `react-dom`, `@xyflow/react` (supplied by the host; do not nest a second React under this package — duplicate React makes hooks fail with `Cannot read properties of null (reading 'useState')`). No `imp-registry` dependency — hosts pass `resolvePorts`. Layout engines (e.g. ELK) stay in hosts. Lab Tauri Vite config dedupes/aliases React to the app copy.

## Consumers

- **Imp Lab Tauri** — primary consumer today (thin host: ELK, registry → add-node types, Save; also reuses `SearchModal` for record quick-open).
- **[Tome](https://github.com/silentorb/tome)** — via thin embed `tome-imp-view` (theme, registry → `resolvePorts` and add-node types). Do **not** add a package dependency on Tome.

Imp stays free of layout fields; converters inject `{0,0}` and drop positions on the way back. Hosts supply a `layout` map to `ImpGraphView`.

## Package layout

| Path | Contents |
| --- | --- |
| `src/convert.ts` | `impToReactFlow`, `reactFlowToImp` (incl. `Edge.order`) |
| `src/edit/` | Precise helpers: inbound replace, ids, add/retitle node, slots, handle encode, connect; `GraphEdit` + `applyGraphEdits` / `diffGraphs`; unresolved stubs |
| `src/components/ImpGraphView.tsx` | Editable RF canvas (graph source in / edit intents out); `onSelectionChange` for host chrome |
| `src/components/ImpNode.tsx` | Precise port handles; header shows `title ?? id` with type subtitle |
| `src/search/` | `SearchModal` (generic quick-pick: keyboard nav, async debounce, portal; themed by `--imp-gv-search-*`) and `rankByQuery` |
| `src/styles.css` | Default canvas/node styles (`imp-graph-view/styles.css`) |

## Editing semantics

- **Input:** a `GraphSource` (`source`): edges plus a node provider. The view does not know or care whether a node is local or remote; every node the provider resolves is an ordinary card. A single document is `graphSource(graph)`.
- **Output:** edit intents via `onEdit(GraphEdit[])` (`addNode`, `updateNode`, `removeNode`, `putEdge`, `removeEdge`), diffed from the view's last snapshot. Hosts route each edit to the source that owns it; `applyGraphEdits(graph, edits)` covers one document. Undo/redo belongs in the host (document snapshots), not in this package.
- **Session:** RF selection/viewport live inside `ImpGraphView` (hosts may observe via `onSelectionChange`); layout merges by node id without remounting.
- **fitViewKey:** optional host load identity; when set, `fitViewOnLoad` runs only when that key changes (open / new tab), not on every topology edit or undo.
- **Precise ports:** singleton connect replaces inbound; variadic expands filled slots + dummy append with `Edge.order`; reorder filled slots rewrites `0..n-1`.
- **Titles:** converters preserve optional `title` / `typeArgs`; `setNodeTitle` / titled `addImpNode` helpers; node header shows `title ?? id`.
- **Literals:** `setNodeInputLiteral`; on-node editors for unconnected singleton scalar/`any` ports (host supplies `CatalogInputPort.type`); hosts may also edit literals in a Properties pane.
- **Unresolved endpoints:** edge endpoints no provider resolves render as `(unresolved)` stub cards (never emitted as nodes). Required so React Flow does not crash on incomplete graphs. Hosts lay them out with `graphWithUnresolvedStubs(source)`.
- **Add node:** with `addableNodeTypes` (and `onEdit`, not `readOnly`), Shift+A over the canvas, double-click on empty canvas, the + control, or `ref.openAddNode()` opens a `SearchModal` of node types. The pick emits an `addNode` edit, an `onLayoutChange` placing it under the pointer (or centered), and selects it once echoed. Hosts without layout persistence still see it where it was placed until their layout covers it.
- **Deferred:** Simple auto-pair mode.

## Quick start

```ts
import type { Graph } from "imp-core-types"
import { ImpGraphView, addImpNode, impToReactFlow } from "imp-graph-view"
import "imp-graph-view/styles.css"
```

## Run

```bash
bun run typecheck
bun test
```

Full verify: `bun run test`.

Local install expects sibling [imp-ts](https://github.com/silentorb/imp-ts) at `../imp-ts`. In aura-workbench use the **editor-tauri** service.

## See also

- [graph-model.md](https://github.com/silentorb/imp-spec/blob/main/docs/packages/imp-core-types/graph-model.md)
- React Flow: [Edges](https://reactflow.dev/api-reference/types/edge), [Handles](https://reactflow.dev/learn/customization/handles)
