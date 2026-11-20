# imp-graph-view — agent notes

## What it is

**Imp Translator** — bidirectional conversion between Imp `Graph` and React Flow `{ nodes, edges }`. Uses `@xyflow/react` for **types** (`Node`, `Edge`); this package does not ship React components.

## Consumers

Supported / intended hosts:

- **Imp Lab Tauri** — consumes this package directly.
- **[Tome](https://github.com/silentorb/tome)** — today via the twin [`imp-react-flow`](https://github.com/silentorb/imp-ts/tree/main/packages/imp-react-flow) package with the same converter contract; treat Tome as a consumer this package must remain compatible with.

Do **not** add a package dependency on Tome. Preserve Imp ↔ RF converter semantics unless intentionally versioning a breaking change Tome can adopt. Layout and UI stay host concerns (Lab may use client ELK in Tauri; Tome currently keeps ELK server-side for diagrams and does not auto-layout its Imp RF canvas—do not assume client ELK is free for the web app). Imp stays free of layout/UI fields; converters inject `{0,0}` and drop positions on the way back.

## Package layout

| Path | Contents |
| --- | --- |
| `src/types.ts` | `ImpReactFlowNodeData` (`inputValues` as Imp `InputValues`) |
| `src/convert.ts` | `impToReactFlow`, `reactFlowToImp` |
| `src/index.ts` | Public re-exports |
| `src/*.test.ts` | Round-trip tests |

## Quick start

```ts
import type { Graph } from "imp-core-types"
import { impToReactFlow, reactFlowToImp } from "imp-graph-view"

const graph: Graph = { nodes: {}, edges: {} }
const { nodes, edges } = impToReactFlow(graph)
const roundTrip = reactFlowToImp(nodes, edges)
```

## Run

```bash
bun run typecheck
bun test
```

Full verify (typecheck + tests):

```bash
bun run test
```

Round-trip tests: empty graph and multi-node graphs preserve node ids, edge ids, and `InputValues`.

Local install expects a sibling [imp-ts](https://github.com/silentorb/imp-ts) checkout at `../imp-ts`.

## See also

- [graph-model.md](https://github.com/silentorb/imp-spec/blob/main/docs/packages/imp-core-types/graph-model.md)
- React Flow: [Edges](https://reactflow.dev/api-reference/types/edge), [Handles](https://reactflow.dev/learn/customization/handles)
