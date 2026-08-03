# Task Context: Task 5

Title: Add the strict Expo evidence API client

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-131
Repository: opsclawd/clmm-v2
Branch: ai/issue-131
Start Commit: cb481028648d88de06c9049de1b83b5931dcfb1b

## Task Requirements

**Files:**

- Create: `apps/app/src/api/evidence.ts`
- Create: `apps/app/src/api/evidence.test.ts`
- Reference only: `apps/app/src/api/http.ts`
- Reference only: `apps/app/src/api/policyInsights.ts`
- Reference only: `packages/application/src/public/index.ts`
- Reference only: canonical valid Evidence fixture under `schemas/regime-engine/evidence-bundle.v1/fixtures/valid/`

**Exported API change:** Add app-local `EvidenceResponse` and `fetchCurrentEvidence(externalSignal?: AbortSignal): Promise<EvidenceResponse>`.

- [ ] Write `accepts only a canonical BFF evidence envelope` first: valid bundle, each allowlisted unavailable reason, null bundle, non-record/array envelope, unknown reason, invalid JSON, non-2xx response, and schema-invalid nested bundle. A null bundle without a recognized reason is malformed and must throw rather than display an unexplained blank state.
- [ ] Write `propagates external abort to the evidence request` first for already-aborted and in-flight abort signals. Assert the fetch signal aborts and the client returns the established human-readable timeout/network error without leaking raw response bodies.
- [ ] Implement a 10,000 ms client timeout, external-signal forwarding and cleanup, one fetch of `${getBffBaseUrl()}/evidence/sol-usdc/current`, record/envelope checks, the allowlisted reason set, and nested validation through the public `parseEvidenceBundle`. Return `{ evidence, unavailableReason? }` only after validation.
- [ ] Commit with `git commit -m "feat(app): fetch current evidence"`.

**Task validation:**

- `pnpm --filter @clmm/app exec vitest run src/api/evidence.test.ts`
- `pnpm --filter @clmm/app exec eslint src/api/evidence.ts src/api/evidence.test.ts`

Expected: canonical data and all degraded envelopes are classified, malformed data is rejected, and abort cleanup passes without retries.

## Repository Targets

### Expected Files

- apps/app/src/api/evidence.ts
- apps/app/src/api/evidence.test.ts

### Reference Files

- apps/app/src/api/http.ts
- apps/app/src/api/policyInsights.ts
- packages/application/src/public/index.ts
- schemas/regime-engine/evidence-bundle.v1/fixtures/valid/

## Validation Commands

```bash
pnpm --filter @clmm/app exec vitest run src/api/evidence.test.ts
pnpm --filter @clmm/app exec eslint src/api/evidence.ts src/api/evidence.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **only canonical envelopes are accepted**: The client accepts a schema-valid bundle or a null bundle with one allowlisted reason and rejects all malformed alternatives. (Test: `accepts only a canonical BFF evidence envelope`)
- **external abort is propagated and cleaned up**: Already-aborted and later-aborted signals abort the fetch and timeout/listener resources are always cleared. (Test: `propagates external abort to the evidence request`)
