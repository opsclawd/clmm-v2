# Scenario Helpers

This directory contains scenario harness helpers for story-by-story testing.

## Naming Convention

Each scenario helper file is named after the breach direction it exercises:

- `lower-bound-breach.ts` — helpers for testing the downside breach path (SOL -> USDC)
- `upper-bound-breach.ts` — helpers for testing the upside breach path (USDC -> SOL)

## What Goes Here

- **Sequence 2** adds: domain-level position + trigger builders for each breach direction
- **Sequence 3** adds: application-level scenario orchestrators using fake ports

## Usage

Import from the package barrel only:

```typescript
import { lowerBoundBreachScenario } from '@clmm/testing';
```

Never import directly from this subdirectory.
