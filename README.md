# Imp Graph View

Imp ↔ [React Flow](https://reactflow.dev/) converters and an editable **Precise** Imp graph canvas for Lab (and future Tome).

- Converters stash Imp `InputValues` on `node.data.inputValues` and round-trip optional `Edge.order`.
- `ImpGraphView` takes an Imp `Graph`, host `resolvePorts` + optional layout positions, and emits Imp on edit.
- Layout engines stay in the host (Lab uses ELK).

```ts
import type { Graph } from "imp-core-types"
import { ImpGraphView, impToReactFlow, reactFlowToImp } from "imp-graph-view"
import "imp-graph-view/styles.css"
```

## Local development

Expect sibling [imp-ts](https://github.com/silentorb/imp-ts) (`../imp-ts`):

```bash
bun install
bun run test
```

In **aura-workbench**, run those in the **editor-tauri** service.
