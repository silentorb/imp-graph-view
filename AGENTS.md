# imp-graph-view — agent notes

## What it is

**Imp Translator** — bidirectional conversion between Imp `Graph` and React Flow `{ nodes, edges }`. Uses `@xyflow/react` for **types** (`Node`, `Edge`); this package does not ship React components.

## Layout

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
