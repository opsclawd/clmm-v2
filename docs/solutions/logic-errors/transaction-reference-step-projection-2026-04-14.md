---
title: Project transaction references per planned step kind
date: 2026-04-14
category: logic-errors
module: packages/application
problem_type: logic_error
component: service_object
symptoms:
  - Submitted executions only recorded a single step kind even when the transaction covered multiple planned steps.
  - Reconciliation repeated signature-status lookups for references that shared the same signature.
  - The submission call site could not reliably recover planned step kinds without preview data.
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - planned-step-kinds
  - transaction-reference
  - reconcile-execution
  - preview-recovery
---

# Project transaction references per planned step kind

## Problem
`submitExecution()` treated one signed payload as one transaction reference, but the plan can bundle multiple step kinds into the same transaction. That under-reported what the submission actually covered.

## Symptoms
- A submission could expose only one `TransactionReference` even when `remove-liquidity`, `collect-fees`, and `swap-assets` were all planned.
- Reconciliation checked the same signature multiple times when several references shared it.
- `SubmitExecutionAttempt()` had no explicit step-kind input unless it recovered the plan from the stored preview.

## Solution
Thread the planned step kinds through submission, fan out references per unique kind, and deduplicate signature lookups during reconciliation.

`SubmitExecutionAttempt()` resolves planned step kinds from `attempt.previewId -> executionRepo.getPreview(previewId) -> preview.plan.steps.map((s) => s.kind)`, and falls back to `['swap-assets']` when preview data is missing.

```ts
const uniqueStepKinds = [...new Set(plannedStepKinds)];
const references = uniqueStepKinds.map((stepKind) => ({
  signature: sig,
  stepKind,
}));
const uniqueSignatures = [...new Set(references.map((r) => r.signature))];
```

`reconcileExecution()` now checks each unique signature once, then projects that status back onto each reference.

## Why This Works
The root problem was a cardinality mismatch: one transaction can cover multiple planned steps, but the old bookkeeping only allowed one step reference. Passing `plannedStepKinds` makes the port contract honest, and deduplicating signature checks avoids repeated RPC work while still classifying every emitted reference correctly.

## Prevention
- Keep `plannedStepKinds` explicit in the submission contract.
- Test the fan-out path, the single-step path, and duplicate step-kind deduplication.
- Assert shared-signature reconciliation only checks each signature once.
- Keep the `swap-assets` fallback covered for attempts that do not have preview data.
