---
title: Regime freshness thresholds displayed hours instead of comparable minutes
date: 2026-05-09
category: ui-bugs
module: '@clmm/ui'
problem_type: ui_bug
component: tooling
symptoms:
  - Soft stale threshold of 4500s (75min) displayed as "1h" instead of "75m"
  - Hard stale threshold of 5400s (90min) displayed as "2h" instead of "90m"
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [regime, freshness, formatting, view-model, threshold]
---

# Regime freshness thresholds displayed hours instead of comparable minutes

## Problem

Regime card freshness thresholds (soft/hard stale) were rendered as hours (`1h`, `2h`) once the value exceeded 60 minutes, making them incomparable with the adjacent "Latest candle" row that always displays age as `Xm old`. A threshold of 90 minutes showing as `2h` is visually inconsistent and harder for users to compare against `90m old`.

## Symptoms

- Soft stale threshold (4500s = 75min) showed `1h` instead of `75m`
- Hard stale threshold (5400s = 90min) showed `2h` instead of `90m`
- Any threshold >= 60 minutes was formatted in hours, losing minute precision

## Solution

Replaced `formatSecondsThreshold` (which switched to hours past 60 minutes) with `formatFreshnessThresholdSeconds` (which always returns minutes):

**Before:**

```ts
function formatSecondsThreshold(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
```

**After:**

```ts
function formatFreshnessThresholdSeconds(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}
```

Both call sites in `buildFreshnessRows` updated. The function is module-private — no exports changed, no other packages touched.

## Why This Works

The hour-switching logic was technically correct for general time display, but the freshness rows need all values in the same unit for visual comparison. The "Latest candle" row already uses `Xm old`, so thresholds must also use minutes to be directly comparable. The new helper is intentionally named `formatFreshnessThresholdSeconds` to signal its specific purpose — not a general-purpose time formatter.

## Prevention

- When displaying related values in a UI, ensure all values use the same unit for comparability
- Name formatting helpers after their domain (e.g., `formatFreshnessThresholdSeconds`) rather than generic names (e.g., `formatSecondsThreshold`) to prevent reuse in inappropriate contexts

## Related Issues

- GitHub: https://github.com/opsclawd/clmm-v2/issues/86
