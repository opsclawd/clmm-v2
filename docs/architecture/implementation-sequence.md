# Implementation Sequence

Do not skip or reorder these phases when establishing foundational behavior.

| Seq | What | Done When |
|-----|------|-----------|
| 1 | Turborepo scaffold, pnpm workspaces, boundary enforcement | CI fails illegal imports and banned concepts |
| 2 | Shared domain kernel in `packages/domain` | `DirectionalExitPolicyService` is pure and exhaustively tested |
| 3 | Application contracts, DTOs, use cases with fakes | UI and adapters can proceed against stable contracts |
| 4 | Off-chain history and observability adapters | Durable history exists before protocol execution wiring |
| 5 | Monitoring and trigger path | Actionable triggers are generated and persisted without UI |
| 6 | Preview generation | Directional preview is generated and refreshed from shared logic |
| 7 | Signing, submission, and reconciliation | Full signed execution lifecycle is supported and history-backed |
| 8 | Notifications and capability path | Best-effort alerts integrated with honest degraded states |
| 9 | UI assembly in `packages/ui` | Native and PWA share contracts and directional copy is primary |

## Story Execution Rules

1. Start from the narrowest package that owns the change.
2. Extend public contracts before extending adapters or UI.
3. Use fake ports from `packages/testing` before real adapters.
4. Never bypass application public APIs with direct adapter imports.
5. Never introduce generic exit behavior that loses breach direction.
6. Never introduce on-chain receipt concepts.
