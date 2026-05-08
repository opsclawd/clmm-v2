# Orca Live Fee And Reward Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the position detail read path from exposing Orca's checkpointed `feeOwedA`, `feeOwedB`, and `rewardInfos[].amountOwed` as if they were live, by computing live fee/reward quotes via Orca's `collectFeesQuote` / `collectRewardsQuote` and failing closed when quotes cannot be computed.

**Architecture:** Add a stateless adapter-local helper (`OrcaPositionFeeRewardQuoteHelper`) that derives tick-array data and calls Orca's quote primitives, returning a discriminated `FeeRewardQuoteResult` union. `SolanaPositionSnapshotReader.fetchPositionDetail` delegates to this helper, never falls back to checkpointed fields, and emits one structured `orca_position_fee_reward_quote_unavailable` warning when the helper returns `unavailable`. Domain types (`PositionFees`, `PositionRewardInfo`, `PositionDetail`) and HTTP contracts stay unchanged; the existing `null`-from-reader → 404 (single position) / 503 `position_detail_unavailable` (insights) plumbing carries quote failures through.

**Tech Stack:** TypeScript, NestJS DI, Vitest, `@solana/kit` v6, `@orca-so/whirlpools-client` v6.2.1 (`getPositionAddress`, `fetchPosition`, `fetchWhirlpool`, `getTickArrayAddress`, `fetchAllTickArray`), `@orca-so/whirlpools-core` v3.1.0 (`collectFeesQuote`, `collectRewardsQuote`, `getTickArrayStartTickIndex`, `getTickIndexInArray`).

---

## File Structure

**Create:**

- `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.ts` — stateless helper. Owns tick-array derivation, fetch, lower/upper tick extraction, `collectFeesQuote`, `collectRewardsQuote`, mapping into domain `PositionFees`. Returns `FeeRewardQuoteResult` discriminated union. Does not log.
- `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts` — unit tests for every result-union arm.

**Modify:**

- `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts` — accept optional `ObservabilityPort` and helper via constructor; in `fetchPositionDetail`, drop direct `pos.feeOwedA / feeOwedB / rewardInfos[].amountOwed` mapping; delegate to helper; on `unavailable`, log one `orca_position_fee_reward_quote_unavailable` warn entry with the documented context fields and return `null`.
- `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts` — add `fetchPositionDetail` describe block: ok path, unavailable → null + log, no-fallback assertion.
- `packages/adapters/src/composition/AdaptersModule.ts` — pass `telemetry` (existing `ObservabilityPort` instance) into the `SolanaPositionSnapshotReader` constructor.
- `packages/adapters/src/inbound/http/AppModule.ts` — same composition wiring as above.

**Verify (no edits expected):**

- `packages/adapters/src/inbound/http/InsightsDataController.test.ts` — confirm 503 `position_detail_unavailable` still fires when `getPositionDetail` returns `null`, since the reader will now return `null` more often (on quote failures).

---

## Task Breakdown

### Task 1: Define result types and ok-path quote helper

**Files:**

- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.ts`
- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts`

- [ ] **Step 1: Write the failing test (ok path)**

Create `OrcaPositionFeeRewardQuoteHelper.test.ts` with:

```ts
/**
 * OrcaPositionFeeRewardQuoteHelper TDD tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrcaPositionFeeRewardQuoteHelper } from './OrcaPositionFeeRewardQuoteHelper';
import type { createSolanaRpc } from '@solana/kit';

vi.mock('@orca-so/whirlpools-client', () => ({
  getTickArrayAddress: vi.fn(),
  fetchAllTickArray: vi.fn(),
}));

vi.mock('@orca-so/whirlpools-core', () => ({
  getTickArrayStartTickIndex: vi.fn(),
  getTickIndexInArray: vi.fn(),
  collectFeesQuote: vi.fn(),
  collectRewardsQuote: vi.fn(),
}));

const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
const MOCK_POSITION_MINT = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hX';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type MockRpc = ReturnType<typeof createSolanaRpc>;

function makePosition(
  overrides: Partial<{
    tickLowerIndex: number;
    tickUpperIndex: number;
    liquidity: bigint;
    feeOwedA: bigint;
    feeOwedB: bigint;
    rewardInfos: Array<{ amountOwed: bigint; growthInsideCheckpoint: bigint }>;
  }> = {},
) {
  return {
    whirlpool: MOCK_WHIRLPOOL,
    tickLowerIndex: -18304,
    tickUpperIndex: -17956,
    liquidity: 100000n,
    feeGrowthCheckpointA: 0n,
    feeGrowthCheckpointB: 0n,
    feeOwedA: 999n,
    feeOwedB: 888n,
    rewardInfos: [
      { amountOwed: 777n, growthInsideCheckpoint: 0n },
      { amountOwed: 0n, growthInsideCheckpoint: 0n },
      { amountOwed: 0n, growthInsideCheckpoint: 0n },
    ],
    ...overrides,
  };
}

function makeWhirlpool(
  overrides: Partial<{
    tickSpacing: number;
    rewardInfos: Array<{ mint: { toString: () => string } }>;
  }> = {},
) {
  return {
    tokenMintA: { toString: () => SOL_MINT },
    tokenMintB: { toString: () => USDC_MINT },
    tickSpacing: 64,
    feeRate: 1000,
    liquidity: 2400000000n,
    sqrtPrice: 184467440737095516n,
    tickCurrentIndex: -18130,
    feeGrowthGlobalA: 0n,
    feeGrowthGlobalB: 0n,
    rewardLastUpdatedTimestamp: 0n,
    rewardInfos: [
      { mint: { toString: () => SOL_MINT } },
      { mint: { toString: () => '11111111111111111111111111111111' } },
      { mint: { toString: () => '11111111111111111111111111111111' } },
    ],
    ...overrides,
  };
}

describe('OrcaPositionFeeRewardQuoteHelper', () => {
  let mockRpc: MockRpc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = {} as MockRpc;
  });

  describe('quote', () => {
    it('returns ok with PositionFees built from collectFeesQuote and collectRewardsQuote', async () => {
      const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
      const {
        getTickArrayStartTickIndex,
        getTickIndexInArray,
        collectFeesQuote,
        collectRewardsQuote,
      } = await import('@orca-so/whirlpools-core');

      vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
      vi.mocked(getTickArrayAddress)
        .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
        .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
      vi.mocked(getTickIndexInArray).mockReturnValueOnce(5).mockReturnValueOnce(10);

      const lowerTick = { initialized: true, liquidityNet: 0n };
      const upperTick = { initialized: true, liquidityNet: 0n };
      vi.mocked(fetchAllTickArray).mockResolvedValue([
        {
          data: {
            ticks: Array.from({ length: 88 }, (_, i) =>
              i === 5 ? lowerTick : { initialized: false },
            ),
          },
        },
        {
          data: {
            ticks: Array.from({ length: 88 }, (_, i) =>
              i === 10 ? upperTick : { initialized: false },
            ),
          },
        },
      ] as never);

      vi.mocked(collectFeesQuote).mockReturnValue({ feeOwedA: 12345n, feeOwedB: 67890n } as never);
      vi.mocked(collectRewardsQuote).mockReturnValue({
        rewards: [{ rewardsOwed: 11111n }, { rewardsOwed: 0n }, { rewardsOwed: 0n }],
      } as never);

      const helper = new OrcaPositionFeeRewardQuoteHelper();
      const result = await helper.quote({
        rpc: mockRpc,
        position: makePosition(),
        positionMint: MOCK_POSITION_MINT,
        whirlpool: makeWhirlpool(),
        whirlpoolAddress: MOCK_WHIRLPOOL,
      });

      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.fees.feeOwedA).toBe(12345n);
      expect(result.fees.feeOwedB).toBe(67890n);
      expect(result.fees.rewardInfos.length).toBe(3);
      expect(result.fees.rewardInfos[0]!.mint).toBe(SOL_MINT);
      expect(result.fees.rewardInfos[0]!.amountOwed).toBe(11111n);
      expect(result.fees.rewardInfos[0]!.decimals).toBe(9);
      expect(result.fees.rewardInfos[1]!.mint).toBe('11111111111111111111111111111111');
      expect(result.fees.rewardInfos[1]!.amountOwed).toBe(0n);
      expect(result.fees.rewardInfos[1]!.decimals).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: FAIL — `Cannot find module './OrcaPositionFeeRewardQuoteHelper'`.

- [ ] **Step 3: Create helper with types and ok-path implementation**

Create `OrcaPositionFeeRewardQuoteHelper.ts`:

```ts
/**
 * OrcaPositionFeeRewardQuoteHelper
 *
 * Computes live fee + reward quotes for an Orca position using the Whirlpools
 * SDK direct quote path. Returns a discriminated `FeeRewardQuoteResult` union;
 * the caller decides what to log and how to surface unavailability.
 *
 * Docs: @orca-so/whirlpools-client v6.2.1, @orca-so/whirlpools-core v3.1.0
 */
import type { createSolanaRpc, Address } from '@solana/kit';
import { getTickArrayAddress, fetchAllTickArray } from '@orca-so/whirlpools-client';
import {
  getTickArrayStartTickIndex,
  getTickIndexInArray,
  collectFeesQuote,
  collectRewardsQuote,
} from '@orca-so/whirlpools-core';

import type { PositionFees, PositionRewardInfo } from '@clmm/domain';
import { KNOWN_TOKENS } from '../price/known-tokens.js';

type Rpc = ReturnType<typeof createSolanaRpc>;

export type FeeRewardQuoteResult =
  | { kind: 'ok'; fees: PositionFees }
  | {
      kind: 'unavailable';
      reason:
        | 'tick-array-fetch-failed'
        | 'tick-data-missing'
        | 'fee-quote-failed'
        | 'reward-quote-failed';
      errorName?: string;
      errorMessage?: string;
    };

type OrcaPosition = {
  tickLowerIndex: number;
  tickUpperIndex: number;
  liquidity: bigint;
  feeGrowthCheckpointA: bigint;
  feeGrowthCheckpointB: bigint;
  feeOwedA: bigint;
  feeOwedB: bigint;
  rewardInfos: ReadonlyArray<{ amountOwed: bigint; growthInsideCheckpoint: bigint }>;
};

type OrcaWhirlpool = {
  tokenMintA: { toString: () => string };
  tokenMintB: { toString: () => string };
  tickSpacing: number;
  feeRate: number;
  liquidity: bigint;
  sqrtPrice: bigint;
  tickCurrentIndex: number;
  feeGrowthGlobalA: bigint;
  feeGrowthGlobalB: bigint;
  rewardLastUpdatedTimestamp: bigint;
  rewardInfos: ReadonlyArray<{ mint: { toString: () => string } }>;
};

export type QuoteArgs = {
  readonly rpc: Rpc;
  readonly position: OrcaPosition;
  readonly positionMint: string;
  readonly whirlpool: OrcaWhirlpool;
  readonly whirlpoolAddress: Address | string;
};

const ERROR_MESSAGE_MAX_LENGTH = 200;

function describeError(err: unknown): { errorName?: string; errorMessage?: string } {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message.slice(0, ERROR_MESSAGE_MAX_LENGTH),
    };
  }
  return { errorMessage: String(err).slice(0, ERROR_MESSAGE_MAX_LENGTH) };
}

export class OrcaPositionFeeRewardQuoteHelper {
  async quote(args: QuoteArgs): Promise<FeeRewardQuoteResult> {
    const { rpc, position, whirlpool, whirlpoolAddress } = args;

    const lowerStart = getTickArrayStartTickIndex(position.tickLowerIndex, whirlpool.tickSpacing);
    const upperStart = getTickArrayStartTickIndex(position.tickUpperIndex, whirlpool.tickSpacing);

    let lowerTickArray: { data: { ticks: ReadonlyArray<unknown> } };
    let upperTickArray: { data: { ticks: ReadonlyArray<unknown> } };
    try {
      const [lowerAddr] = await getTickArrayAddress(whirlpoolAddress as Address, lowerStart);
      const [upperAddr] = await getTickArrayAddress(whirlpoolAddress as Address, upperStart);
      const [lower, upper] = await fetchAllTickArray(rpc, [lowerAddr, upperAddr]);
      lowerTickArray = lower as never;
      upperTickArray = upper as never;
    } catch (err) {
      return { kind: 'unavailable', reason: 'tick-array-fetch-failed', ...describeError(err) };
    }

    const lowerIdx = getTickIndexInArray(
      position.tickLowerIndex,
      lowerStart,
      whirlpool.tickSpacing,
    );
    const upperIdx = getTickIndexInArray(
      position.tickUpperIndex,
      upperStart,
      whirlpool.tickSpacing,
    );
    const lowerTick = lowerTickArray.data.ticks[lowerIdx];
    const upperTick = upperTickArray.data.ticks[upperIdx];
    if (lowerTick == null || upperTick == null) {
      return { kind: 'unavailable', reason: 'tick-data-missing' };
    }

    let feesQuote: { feeOwedA: bigint; feeOwedB: bigint };
    try {
      feesQuote = collectFeesQuote(
        whirlpool as never,
        position as never,
        lowerTick as never,
        upperTick as never,
      );
    } catch (err) {
      return { kind: 'unavailable', reason: 'fee-quote-failed', ...describeError(err) };
    }

    let rewardsQuote: { rewards: ReadonlyArray<{ rewardsOwed: bigint }> };
    try {
      const currentUnixTimestamp = BigInt(Math.floor(Date.now() / 1000));
      rewardsQuote = collectRewardsQuote(
        whirlpool as never,
        position as never,
        lowerTick as never,
        upperTick as never,
        currentUnixTimestamp,
      );
    } catch (err) {
      return { kind: 'unavailable', reason: 'reward-quote-failed', ...describeError(err) };
    }

    const rewardInfos: PositionRewardInfo[] = position.rewardInfos.map((_, idx) => {
      const poolReward = whirlpool.rewardInfos[idx];
      const rewardMint = poolReward?.mint?.toString() ?? '';
      const known = KNOWN_TOKENS[rewardMint];
      const rewardsOwed = rewardsQuote.rewards[idx]?.rewardsOwed ?? 0n;
      return {
        mint: rewardMint,
        amountOwed: rewardMint === '' ? 0n : rewardsOwed,
        decimals: known?.decimals ?? null,
      };
    });

    const fees: PositionFees = {
      feeOwedA: feesQuote.feeOwedA,
      feeOwedB: feesQuote.feeOwedB,
      rewardInfos,
    };

    return { kind: 'ok', fees };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: PASS — 1 test in 1 file.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.ts \
        packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts
git commit -m "feat(adapters): add Orca live fee/reward quote helper (ok path)"
```

---

### Task 2: Quote helper — tick-array fetch failure

**Files:**

- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts`

- [ ] **Step 1: Write the failing test**

Inside the existing `describe('quote', ...)` block, add:

```ts
it('returns unavailable with reason "tick-array-fetch-failed" when fetchAllTickArray throws', async () => {
  const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
  const { getTickArrayStartTickIndex } = await import('@orca-so/whirlpools-core');

  vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
  vi.mocked(getTickArrayAddress)
    .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
    .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
  vi.mocked(fetchAllTickArray).mockRejectedValue(new Error('rpc 429'));

  const helper = new OrcaPositionFeeRewardQuoteHelper();
  const result = await helper.quote({
    rpc: mockRpc,
    position: makePosition(),
    positionMint: MOCK_POSITION_MINT,
    whirlpool: makeWhirlpool(),
    whirlpoolAddress: MOCK_WHIRLPOOL,
  });

  expect(result.kind).toBe('unavailable');
  if (result.kind !== 'unavailable') throw new Error('expected unavailable');
  expect(result.reason).toBe('tick-array-fetch-failed');
  expect(result.errorName).toBe('Error');
  expect(result.errorMessage).toBe('rpc 429');
});
```

- [ ] **Step 2: Run test to verify it passes (already implemented in Task 1)**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: PASS — 2 tests.

If it fails, the catch block in `quote` is missing or routes the wrong reason; fix in helper to match.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts
git commit -m "test(adapters): cover tick-array-fetch-failed quote helper path"
```

---

### Task 3: Quote helper — missing lower or upper tick data

**Files:**

- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `describe('quote', ...)`:

```ts
it('returns unavailable with reason "tick-data-missing" when ticks[idx] is undefined', async () => {
  const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
  const { getTickArrayStartTickIndex, getTickIndexInArray } =
    await import('@orca-so/whirlpools-core');

  vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
  vi.mocked(getTickArrayAddress)
    .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
    .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
  vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(99);
  vi.mocked(fetchAllTickArray).mockResolvedValue([
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
  ] as never);

  const helper = new OrcaPositionFeeRewardQuoteHelper();
  const result = await helper.quote({
    rpc: mockRpc,
    position: makePosition(),
    positionMint: MOCK_POSITION_MINT,
    whirlpool: makeWhirlpool(),
    whirlpoolAddress: MOCK_WHIRLPOOL,
  });

  expect(result.kind).toBe('unavailable');
  if (result.kind !== 'unavailable') throw new Error('expected unavailable');
  expect(result.reason).toBe('tick-data-missing');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: PASS — 3 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts
git commit -m "test(adapters): cover tick-data-missing quote helper path"
```

---

### Task 4: Quote helper — fee quote failure

**Files:**

- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('returns unavailable with reason "fee-quote-failed" when collectFeesQuote throws', async () => {
  const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
  const { getTickArrayStartTickIndex, getTickIndexInArray, collectFeesQuote } =
    await import('@orca-so/whirlpools-core');

  vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
  vi.mocked(getTickArrayAddress)
    .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
    .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
  vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(0);
  vi.mocked(fetchAllTickArray).mockResolvedValue([
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
  ] as never);
  vi.mocked(collectFeesQuote).mockImplementation(() => {
    throw new Error('wasm overflow');
  });

  const helper = new OrcaPositionFeeRewardQuoteHelper();
  const result = await helper.quote({
    rpc: mockRpc,
    position: makePosition(),
    positionMint: MOCK_POSITION_MINT,
    whirlpool: makeWhirlpool(),
    whirlpoolAddress: MOCK_WHIRLPOOL,
  });

  expect(result.kind).toBe('unavailable');
  if (result.kind !== 'unavailable') throw new Error('expected unavailable');
  expect(result.reason).toBe('fee-quote-failed');
  expect(result.errorMessage).toBe('wasm overflow');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: PASS — 4 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts
git commit -m "test(adapters): cover fee-quote-failed quote helper path"
```

---

### Task 5: Quote helper — reward quote failure

**Files:**

- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('returns unavailable with reason "reward-quote-failed" when collectRewardsQuote throws', async () => {
  const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
  const { getTickArrayStartTickIndex, getTickIndexInArray, collectFeesQuote, collectRewardsQuote } =
    await import('@orca-so/whirlpools-core');

  vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
  vi.mocked(getTickArrayAddress)
    .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
    .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
  vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(0);
  vi.mocked(fetchAllTickArray).mockResolvedValue([
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
  ] as never);
  vi.mocked(collectFeesQuote).mockReturnValue({ feeOwedA: 1n, feeOwedB: 2n } as never);
  vi.mocked(collectRewardsQuote).mockImplementation(() => {
    throw new Error('rewards bug');
  });

  const helper = new OrcaPositionFeeRewardQuoteHelper();
  const result = await helper.quote({
    rpc: mockRpc,
    position: makePosition(),
    positionMint: MOCK_POSITION_MINT,
    whirlpool: makeWhirlpool(),
    whirlpoolAddress: MOCK_WHIRLPOOL,
  });

  expect(result.kind).toBe('unavailable');
  if (result.kind !== 'unavailable') throw new Error('expected unavailable');
  expect(result.reason).toBe('reward-quote-failed');
  expect(result.errorMessage).toBe('rewards bug');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: PASS — 5 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts
git commit -m "test(adapters): cover reward-quote-failed quote helper path"
```

---

### Task 6: Quote helper — preserve inactive/empty reward mints without fake entries

**Files:**

- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
it('keeps empty/inactive reward slots with mint="", decimals=null, amountOwed=0n even when quote returns nonzero', async () => {
  const { getTickArrayAddress, fetchAllTickArray } = await import('@orca-so/whirlpools-client');
  const { getTickArrayStartTickIndex, getTickIndexInArray, collectFeesQuote, collectRewardsQuote } =
    await import('@orca-so/whirlpools-core');

  vi.mocked(getTickArrayStartTickIndex).mockReturnValueOnce(-22528).mockReturnValueOnce(-22528);
  vi.mocked(getTickArrayAddress)
    .mockResolvedValueOnce(['LowerTickArrayAddr1' as never] as never)
    .mockResolvedValueOnce(['UpperTickArrayAddr1' as never] as never);
  vi.mocked(getTickIndexInArray).mockReturnValueOnce(0).mockReturnValueOnce(0);
  vi.mocked(fetchAllTickArray).mockResolvedValue([
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
    { data: { ticks: [{ initialized: true, liquidityNet: 0n }] } },
  ] as never);
  vi.mocked(collectFeesQuote).mockReturnValue({ feeOwedA: 0n, feeOwedB: 0n } as never);
  vi.mocked(collectRewardsQuote).mockReturnValue({
    rewards: [{ rewardsOwed: 50n }, { rewardsOwed: 50n }, { rewardsOwed: 50n }],
  } as never);

  const helper = new OrcaPositionFeeRewardQuoteHelper();
  const result = await helper.quote({
    rpc: mockRpc,
    position: makePosition(),
    positionMint: MOCK_POSITION_MINT,
    whirlpool: makeWhirlpool({
      rewardInfos: [
        { mint: { toString: () => '' } },
        { mint: { toString: () => '' } },
        { mint: { toString: () => '' } },
      ],
    }),
    whirlpoolAddress: MOCK_WHIRLPOOL,
  });

  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') throw new Error('expected ok');
  expect(result.fees.rewardInfos.length).toBe(3);
  for (const ri of result.fees.rewardInfos) {
    expect(ri.mint).toBe('');
    expect(ri.decimals).toBeNull();
    expect(ri.amountOwed).toBe(0n);
  }
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionFeeRewardQuoteHelper`
Expected: PASS — 6 tests.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.test.ts
git commit -m "test(adapters): preserve empty reward slots in quote helper"
```

---

### Task 7: Wire helper into reader; log warning; return null on unavailable

**Files:**

- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

- [ ] **Step 1: Write the failing test (ok path through reader → helper)**

Append to `SolanaPositionSnapshotReader.test.ts` (inside the top-level `describe('SolanaPositionSnapshotReader', ...)`):

```ts
describe('fetchPositionDetail', () => {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  function setupHappyMocks() {
    return import('@orca-so/whirlpools-client').then(
      ({ getPositionAddress, fetchPosition, fetchWhirlpool }) => {
        vi.mocked(getPositionAddress).mockResolvedValue([
          address(MOCK_POSITION_PDA),
        ] as unknown as Awaited<ReturnType<typeof getPositionAddress>>);
        vi.mocked(fetchPosition).mockResolvedValue({
          data: {
            whirlpool: address(MOCK_WHIRLPOOL),
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            liquidity: 1000n,
            feeGrowthCheckpointA: 0n,
            feeGrowthCheckpointB: 0n,
            feeOwedA: 9999n,
            feeOwedB: 8888n,
            positionMint: address(MOCK_POSITION_MINT),
            rewardInfos: [
              { amountOwed: 7777n, growthInsideCheckpoint: 0n },
              { amountOwed: 0n, growthInsideCheckpoint: 0n },
              { amountOwed: 0n, growthInsideCheckpoint: 0n },
            ],
          },
        } as unknown as Awaited<ReturnType<typeof fetchPosition>>);
        vi.mocked(fetchWhirlpool).mockResolvedValue({
          data: {
            tickCurrentIndex: -18130,
            sqrtPrice: 184467440737095516n,
            tokenMintA: { toString: () => SOL_MINT },
            tokenMintB: { toString: () => USDC_MINT },
            feeRate: 1000,
            tickSpacing: 64,
            liquidity: 2400000000n,
            rewardInfos: [
              { mint: { toString: () => SOL_MINT } },
              { mint: { toString: () => '11111111111111111111111111111111' } },
              { mint: { toString: () => '11111111111111111111111111111111' } },
            ],
          },
        } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);
      },
    );
  }

  it('returns detail with live fees from helper when quote succeeds', async () => {
    await setupHappyMocks();

    const helper = {
      quote: vi.fn().mockResolvedValue({
        kind: 'ok',
        fees: {
          feeOwedA: 12345n,
          feeOwedB: 67890n,
          rewardInfos: [{ mint: SOL_MINT, amountOwed: 11111n, decimals: 9 }],
        },
      }),
    };
    const reader = new SolanaPositionSnapshotReader(mockRpcUrl, undefined, helper as never);
    const result = await reader.fetchPositionDetail(
      mockRpcWithOwnership as never,
      MOCK_POSITION_MINT,
      MOCK_WALLET,
    );

    expect(result).not.toBeNull();
    expect(result!.fees.feeOwedA).toBe(12345n);
    expect(result!.fees.feeOwedB).toBe(67890n);
    expect(helper.quote).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs orca_position_fee_reward_quote_unavailable warn when helper returns unavailable', async () => {
    await setupHappyMocks();

    const helper = {
      quote: vi.fn().mockResolvedValue({
        kind: 'unavailable',
        reason: 'fee-quote-failed',
        errorName: 'Error',
        errorMessage: 'wasm overflow',
      }),
    };
    const observability = {
      log: vi.fn(),
      recordTiming: vi.fn(),
      recordDetectionTiming: vi.fn(),
      recordDeliveryTiming: vi.fn(),
    };
    const reader = new SolanaPositionSnapshotReader(
      mockRpcUrl,
      observability as never,
      helper as never,
    );
    const result = await reader.fetchPositionDetail(
      mockRpcWithOwnership as never,
      MOCK_POSITION_MINT,
      MOCK_WALLET,
    );

    expect(result).toBeNull();
    expect(observability.log).toHaveBeenCalledTimes(1);
    expect(observability.log).toHaveBeenCalledWith(
      'warn',
      'orca_position_fee_reward_quote_unavailable',
      expect.objectContaining({
        positionId: MOCK_POSITION_MINT,
        walletId: MOCK_WALLET,
        poolId: MOCK_WHIRLPOOL,
        lowerTick: -18304,
        upperTick: -17956,
        tickSpacing: 64,
        reason: 'fee-quote-failed',
        errorName: 'Error',
        errorMessage: 'wasm overflow',
      }),
    );
  });

  it('does not fall back to checkpointed pos.feeOwedA / pos.feeOwedB / pos.rewardInfos[].amountOwed on quote failure', async () => {
    await setupHappyMocks();

    const helper = {
      quote: vi.fn().mockResolvedValue({
        kind: 'unavailable',
        reason: 'tick-array-fetch-failed',
      }),
    };
    const observability = {
      log: vi.fn(),
      recordTiming: vi.fn(),
      recordDetectionTiming: vi.fn(),
      recordDeliveryTiming: vi.fn(),
    };
    const reader = new SolanaPositionSnapshotReader(
      mockRpcUrl,
      observability as never,
      helper as never,
    );
    const result = await reader.fetchPositionDetail(
      mockRpcWithOwnership as never,
      MOCK_POSITION_MINT,
      MOCK_WALLET,
    );

    expect(result).toBeNull();
    const stringified = JSON.stringify(observability.log.mock.calls, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(stringified).not.toContain('9999');
    expect(stringified).not.toContain('8888');
    expect(stringified).not.toContain('7777');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/adapters test -- SolanaPositionSnapshotReader`
Expected: FAIL — `SolanaPositionSnapshotReader` constructor takes only `rpcUrl`; passing extra args is a TS error or ignored at runtime, and `fetchPositionDetail` still maps raw fields.

- [ ] **Step 3: Update reader to accept observability + helper and delegate**

Replace `SolanaPositionSnapshotReader.ts` with:

```ts
/**
 * SolanaPositionSnapshotReader
 *
 * Fetches a single position snapshot from Solana using @solana/kit and @orca-so/whirlpools-client.
 * This reader is used for detailed position inspection and is not responsible for
 * determining breach direction or exit posture - that lives in packages/domain.
 *
 * Live fee/reward computation for fetchPositionDetail is delegated to
 * OrcaPositionFeeRewardQuoteHelper. Checkpointed fields on the Orca position
 * account are NEVER mapped into returned PositionFees; quote failures fail
 * closed (return null) and emit a single structured warning via the
 * ObservabilityPort, when one is supplied.
 *
 * Docs: @solana/kit v6, @orca-so/whirlpools-client v6.2.1
 */
import { createSolanaRpc, address } from '@solana/kit';
import { getPositionAddress, fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';

import type { ObservabilityPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId, PoolData, PositionFees } from '@clmm/domain';
import { makePoolId, makeClockTimestamp, evaluateRangeState } from '@clmm/domain';
import { KNOWN_TOKENS } from '../price/known-tokens.js';
import { OrcaPositionFeeRewardQuoteHelper } from './OrcaPositionFeeRewardQuoteHelper.js';

export type WhirlpoolData = {
  tickCurrentIndex: number;
  sqrtPrice: bigint;
  tokenMintA: string;
  tokenMintB: string;
  feeRate: number;
  tickSpacing: number;
  liquidity: bigint;
};

export class SolanaPositionSnapshotReader {
  constructor(
    private readonly rpcUrl: string,
    private readonly observability?: ObservabilityPort,
    private readonly quoteHelper: OrcaPositionFeeRewardQuoteHelper = new OrcaPositionFeeRewardQuoteHelper(),
  ) {}

  getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async fetchSinglePosition(
    rpc: ReturnType<typeof createSolanaRpc>,
    positionId: PositionId,
    walletId: WalletId,
  ): Promise<LiquidityPosition | null> {
    try {
      const positionMint = address(positionId);
      const [positionAddress] = await getPositionAddress(positionMint);
      const positionAccount = await fetchPosition(rpc, positionAddress);
      const position = positionAccount.data;

      const isOwner = await this.verifyOwnership(rpc, walletId, positionId);
      if (!isOwner) {
        return null;
      }

      const whirlpoolAddress = position.whirlpool;
      const whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
      const whirlpool = whirlpoolAccount.data;

      const bounds = {
        lowerBound: position.tickLowerIndex,
        upperBound: position.tickUpperIndex,
      };

      const currentTick = whirlpool.tickCurrentIndex;
      const rangeState = evaluateRangeState(bounds, currentTick);

      return {
        positionId,
        walletId,
        poolId: makePoolId(whirlpoolAddress.toString()),
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      };
    } catch {
      return null;
    }
  }

  async verifyOwnership(
    rpc: ReturnType<typeof createSolanaRpc>,
    walletId: WalletId,
    positionId: PositionId,
  ): Promise<boolean> {
    try {
      const ownerAddress = address(walletId);
      const mintAddress = address(positionId);

      const response = await rpc
        .getTokenAccountsByOwner(ownerAddress, { mint: mintAddress }, { encoding: 'jsonParsed' })
        .send();

      return response.value.some(
        (account) => BigInt(account.account.data.parsed.info.tokenAmount.amount) > 0n,
      );
    } catch {
      return false;
    }
  }

  async fetchWhirlpoolsBatched(
    rpc: ReturnType<typeof createSolanaRpc>,
    whirlpoolAddresses: string[],
  ): Promise<Map<string, WhirlpoolData>> {
    const uniqueAddresses = [...new Set(whirlpoolAddresses)];
    const results = new Map<string, WhirlpoolData>();

    if (uniqueAddresses.length === 0) {
      return results;
    }

    const WHIRLPOOL_FETCH_BATCH_SIZE = 2;

    for (let i = 0; i < uniqueAddresses.length; i += WHIRLPOOL_FETCH_BATCH_SIZE) {
      const batch = uniqueAddresses.slice(i, i + WHIRLPOOL_FETCH_BATCH_SIZE);

      await Promise.all(
        batch.map(async (addr) => {
          try {
            const whirlpoolAccount = await fetchWhirlpool(rpc, address(addr));
            const w = whirlpoolAccount.data;
            results.set(addr, {
              tickCurrentIndex: w.tickCurrentIndex,
              sqrtPrice: w.sqrtPrice,
              tokenMintA: w.tokenMintA.toString(),
              tokenMintB: w.tokenMintB.toString(),
              feeRate: w.feeRate,
              tickSpacing: w.tickSpacing,
              liquidity: w.liquidity,
            });
          } catch {
            // Skip failed fetches — positions referencing this pool will be excluded.
          }
        }),
      );
    }

    return results;
  }

  async fetchPositionDetail(
    rpc: ReturnType<typeof createSolanaRpc>,
    positionId: PositionId,
    walletId: WalletId,
  ): Promise<{
    position: LiquidityPosition;
    poolData: PoolData;
    fees: PositionFees;
    positionLiquidity: bigint;
  } | null> {
    let positionMint;
    let positionAddress;
    let positionAccount;
    try {
      positionMint = address(positionId);
      [positionAddress] = await getPositionAddress(positionMint);
      positionAccount = await fetchPosition(rpc, positionAddress);
    } catch {
      return null;
    }
    const pos = positionAccount.data;

    const isOwner = await this.verifyOwnership(rpc, walletId, positionId);
    if (!isOwner) {
      return null;
    }

    let whirlpoolAddress;
    let whirlpoolAccount;
    try {
      whirlpoolAddress = pos.whirlpool;
      whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
    } catch {
      return null;
    }
    const w = whirlpoolAccount.data;

    const poolIdStr = whirlpoolAddress.toString();
    const mintA = w.tokenMintA.toString();
    const mintB = w.tokenMintB.toString();
    const knownA = KNOWN_TOKENS[mintA];
    const knownB = KNOWN_TOKENS[mintB];

    const poolData: PoolData = {
      poolId: makePoolId(poolIdStr),
      tokenPair: {
        mintA,
        mintB,
        symbolA: knownA?.symbol ?? mintA,
        symbolB: knownB?.symbol ?? mintB,
        decimalsA: knownA?.decimals ?? null,
        decimalsB: knownB?.decimals ?? null,
      },
      sqrtPrice: w.sqrtPrice,
      feeRate: w.feeRate,
      tickSpacing: w.tickSpacing,
      liquidity: w.liquidity,
      tickCurrentIndex: w.tickCurrentIndex,
    };

    const quote = await this.quoteHelper.quote({
      rpc,
      position: pos as never,
      positionMint: positionId,
      whirlpool: w as never,
      whirlpoolAddress,
    });

    if (quote.kind !== 'ok') {
      this.observability?.log('warn', 'orca_position_fee_reward_quote_unavailable', {
        positionId,
        walletId,
        poolId: poolIdStr,
        lowerTick: pos.tickLowerIndex,
        upperTick: pos.tickUpperIndex,
        tickSpacing: w.tickSpacing,
        reason: quote.reason,
        ...(quote.errorName !== undefined ? { errorName: quote.errorName } : {}),
        ...(quote.errorMessage !== undefined ? { errorMessage: quote.errorMessage } : {}),
      });
      return null;
    }

    const bounds = {
      lowerBound: pos.tickLowerIndex,
      upperBound: pos.tickUpperIndex,
    };

    const rangeState = evaluateRangeState(bounds, w.tickCurrentIndex);

    const position: LiquidityPosition = {
      positionId,
      walletId,
      poolId: makePoolId(poolIdStr),
      bounds,
      lastObservedAt: makeClockTimestamp(Date.now()),
      rangeState,
      monitoringReadiness: { kind: 'active' },
    };

    return {
      position,
      poolData,
      fees: quote.fees,
      positionLiquidity: pos.liquidity,
    };
  }
}
```

- [ ] **Step 4: Run reader tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- SolanaPositionSnapshotReader`
Expected: PASS — pre-existing tests + 3 new `fetchPositionDetail` tests.

- [ ] **Step 5: Run the full adapter package test suite to catch regressions**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS. If `OrcaPositionReadAdapter.test.ts` or other reader callers break, they'd be due to constructor positional-arg confusion — fix call sites, not the new optional-arg signature.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts \
        packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
git commit -m "feat(adapters): delegate fetchPositionDetail fees/rewards to live quote helper"
```

---

### Task 8: Wire ObservabilityPort through composition

**Files:**

- Modify: `packages/adapters/src/composition/AdaptersModule.ts:61`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts:92`

- [ ] **Step 1: Update `AppModule.ts`**

In `packages/adapters/src/inbound/http/AppModule.ts`, the order of `const telemetry = new TelemetryAdapter();` is currently after `snapshotReader` is constructed. Move the telemetry instantiation up so it can be passed in. Replace lines 92 and the surrounding telemetry init:

Find:

```ts
const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
```

Replace with:

```ts
const telemetryEarly = new TelemetryAdapter();
const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl, telemetryEarly);
```

Then find the existing `const telemetry = new TelemetryAdapter();` later in the file and replace with:

```ts
const telemetry = telemetryEarly;
```

This keeps a single shared `TelemetryAdapter` instance for both the reader and the DI container.

- [ ] **Step 2: Update `AdaptersModule.ts`**

In `packages/adapters/src/composition/AdaptersModule.ts`, do the same. Find:

```ts
const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
```

Replace with:

```ts
const telemetryEarly = new TelemetryAdapter();
const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl, telemetryEarly);
```

Then find the existing `const telemetry = new TelemetryAdapter();` and replace with:

```ts
const telemetry = telemetryEarly;
```

- [ ] **Step 3: Run adapter typecheck and tests**

Run: `pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters test`
Expected: PASS for both.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/composition/AdaptersModule.ts \
        packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): wire ObservabilityPort into SolanaPositionSnapshotReader"
```

---

### Task 9: Verify insights endpoints still surface 503 position_detail_unavailable

**Files:**

- Read-only: `packages/adapters/src/inbound/http/InsightsDataController.test.ts:167-186` (single-position case)
- Read-only: `packages/adapters/src/inbound/http/InsightsDataController.test.ts:227-246` (bundle case)

- [ ] **Step 1: Run the insights controller test suite directly**

Run: `pnpm --filter @clmm/adapters test -- InsightsDataController`
Expected: PASS — both `position_detail_unavailable` cases still return HTTP 503 because the controller branches on `getPositionDetail` returning `null`/throwing, and the reader continues to return `null` on quote failure.

- [ ] **Step 2: Run application package tests**

Run: `pnpm --filter @clmm/application test`
Expected: PASS — domain DTO shapes (`PositionFees`, `PositionDetail`) are unchanged, so application use-cases compile and behave identically.

No commit on this task; it is verification only. If a test fails, treat it as a regression and fix the implementation before proceeding.

---

### Task 10: Verify root typecheck and document fence completion

**Files:** none modified.

- [ ] **Step 1: Run root typecheck**

Run: `pnpm typecheck`
Expected: PASS. Domain types and exported adapter types are unchanged; only the internal reader constructor gained two optional params.

- [ ] **Step 2: Run the full adapter package test suite one more time**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS — confirms helper tests, reader tests, and existing controller tests all green.

- [ ] **Step 3: Spot-verify no leftover stale-field reads in fetchPositionDetail**

Run: `grep -n "feeOwedA\\|feeOwedB\\|amountOwed" packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
Expected: empty output (no matches). The helper still reads `feeOwedA`/`feeOwedB` from the SDK's `CollectFeesQuote`, but the reader no longer references those names directly.

If the grep matches, find the source location and remove the stale-field mapping — failing closed is the rule.

- [ ] **Step 4: No commit needed if verification passes; otherwise fix and recommit per task above.**

---

## Spec Coverage Summary

- Helper at `packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.ts` — Task 1.
- Helper wired only into `fetchPositionDetail` — Task 7.
- Domain `PositionFees` shape preserved — types in Task 1 use existing exports unchanged.
- Application DTOs and HTTP contracts preserved — verified Task 9; no controller code is touched.
- Structured observability for quote failures (`orca_position_fee_reward_quote_unavailable` warn with documented context) — Task 7 + Task 8 wires it.
- Adapter and existing endpoint behavior tests — Tasks 1–7, 9, 10.
- Out-of-scope items (no `harvestPositionInstructions`, no `feeQuoteStatus`, no list-card changes, no summary fee/reward fields) — none added.

## Self-Review Notes

- All `kind` arms of `FeeRewardQuoteResult` (`ok`, four `unavailable` reasons) are covered by tests in Tasks 1–6.
- Reader constructor adds `observability?` and `quoteHelper` with default — backwards-compatible for any caller that constructs with `(rpcUrl)` alone (`SolanaExecutionPreparationAdapter` is unaffected).
- Task 7 explicitly asserts no checkpointed `9999n / 8888n / 7777n` value leaks into either the returned detail (it's `null`) or the log payload, satisfying the "do not fall back to stale fields" requirement.
- Inactive reward mints get `mint='', decimals=null, amountOwed=0n` — Task 6 pins this behavior.
- Log context fields match the spec exactly: `positionId`, `walletId`, `poolId`, `lowerTick`, `upperTick`, `tickSpacing`, `reason`, optional `errorName`, optional capped `errorMessage` (200-char cap implemented in helper).
