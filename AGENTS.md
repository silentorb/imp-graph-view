# imp-graph-view — agent notes

## What it is

**Imp React graph view** — bidirectional Imp `Graph` ↔ React Flow converters **plus** an editable Precise RF canvas (`ImpGraphView`, `ImpNode`).

Peers: `react`, `react-dom`, `@xyflow/react` (supplied by the host; do not nest a second React under this package — duplicate React makes hooks fail with `Cannot read properties of null (reading 'useState')`). No `imp-registry` dependency — hosts pass `resolvePorts`. Layout engines (e.g. ELK) stay in hosts. Lab Tauri Vite config dedupes/aliases React to the app copy.

## Consumers

- **Imp Lab Tauri** — primary consumer today (thin host: ELK, registry, Add palette, Save).
- **[Tome](https://github.com/silentorb/tome)** — designed so Tome can adopt later; today Tome still uses twin [`imp-react-flow`](https://github.com/silentorb/imp-ts/tree/main/packages/imp-react-flow) + `tome-react-flow`. Do **not** add a package dependency on Tome.

Imp stays free of layout fields; converters inject `{0,0}` and drop positions on the way back. Hosts supply a `layout` map to `ImpGraphView`.

## Package layout

| Path | Contents |
| --- | --- |
| `src/convert.ts` | `impToReactFlow`, `reactFlowToImp` (incl. `Edge.order`) |
| `src/edit/` | Precise helpers: inbound replace, ids, add/retitle node, slots, handle encode, connect |
| `src/components/ImpGraphView.tsx` | Editable RF canvas (Imp in / Imp out); `onSelectionChange` for host chrome |
| `src/components/ImpNode.tsx` | Precise port handles; header shows `title ?? id` with type subtitle |
| `src/styles.css` | Default canvas/node styles (`imp-graph-view/styles.css`) |

## Editing semantics

- **Document:** Imp `Graph` via `onGraphChange`.
- **Session:** RF selection/viewport live inside `ImpGraphView` (hosts may observe via `onSelectionChange`); layout merges by node id without remounting.
- **Precise ports:** singleton connect replaces inbound; variadic expands filled slots + dummy append with `Edge.order`; reorder filled slots rewrites `0..n-1`.
- **Titles:** converters preserve optional `title` / `typeArgs`; `setNodeTitle` / titled `addImpNode` helpers; node header shows `title ?? id`.
- **Missing endpoints:** dangling edge node ids render as `(missing)` stub cards (not written into `Graph.nodes` on emit). Required so React Flow does not crash on incomplete documents.
- **Deferred:** Simple auto-pair mode, literal inspectors.

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
