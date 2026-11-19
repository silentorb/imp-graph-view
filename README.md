# Imp Graph View

Bidirectional converters between Imp graphs and [React Flow](https://reactflow.dev/) (`@xyflow/react`) node/edge arrays.

Imp stays free of layout/UI fields. Converters stash Imp `InputValues` on React Flow `node.data.inputValues` so instance literals round-trip. Port templates come from `NodeType` catalogs / the registry.

```ts
import type { Graph } from "imp-core-types"
import { impToReactFlow, reactFlowToImp } from "imp-graph-view"

const { nodes, edges } = impToReactFlow(graph)
const again = reactFlowToImp(nodes, edges)
```

## Local development

Expect a sibling [imp-ts](https://github.com/silentorb/imp-ts) checkout (`../imp-ts`) so Bun workspaces can resolve Imp peers:

```bash
bun install
bun run test
```

In **aura-workbench**, run those commands in the **editor-tauri** service (Bun is available there).
