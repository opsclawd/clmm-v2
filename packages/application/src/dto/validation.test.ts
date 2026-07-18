import { describe, expect, it } from 'vitest';
import type { PositionListFinancialMetricsDto, PositionValueMetricDto } from './index.js';
import { isPositionListFinancialMetricsDto } from './validation.js';

const validMetrics: PositionListFinancialMetricsDto = {
  positionValue: {
    valueUsd: 0,
    valuedAtUnixMs: 1_800_000_000_000,
    source: 'authoritative-test-source',
    basis: 'principal-token-amounts',
    scope: 'returned-supported-positions',
    excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
  },
  unclaimedFees: {
    valueUsd: 0,
    valuedAtUnixMs: 1_800_000_000_000,
    source: 'authoritative-test-source',
    basis: 'currently-claimable-trading-fees',
    scope: 'returned-supported-positions',
    excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
  },
  poolsById: {
    'pool-1': {
      tvl: {
        poolId: 'pool-1' as import('@clmm/domain').PoolId,
        valueUsd: 0,
        observedAtUnixMs: 1_800_000_000_000,
        source: 'authoritative-test-source',
        scope: 'whole-orca-pool',
      },
      fees24h: {
        poolId: 'pool-1' as import('@clmm/domain').PoolId,
        valueUsd: 0,
        source: 'authoritative-test-source',
        windowStartUnixMs: 1_799_913_600_000,
        windowEndUnixMs: 1_800_000_000_000,
        scope: 'whole-orca-pool',
      },
    },
  },
};

describe('PositionListFinancialMetricsDto validation', () => {
  describe('accepts unavailable financial metrics', () => {
    it('accepts null positionValue and null unclaimedFees', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });

    it('accepts null tvl and null fees24h per pool', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: null,
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });

    it('accepts empty poolsById', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });
  });

  describe('accepts exact zero when required metric metadata is present', () => {
    it('accepts zero valueUsd in positionValue with valid metadata', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 0,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });

    it('accepts zero valueUsd in unclaimedFees with valid metadata', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: {
          valueUsd: 0,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'currently-claimable-trading-fees',
          scope: 'returned-supported-positions',
          excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
        },
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });

    it('accepts zero valueUsd in pool tvl with valid metadata', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 0,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });

    it('accepts zero valueUsd in pool fees24h with valid metadata', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 0,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });
  });

  describe('accepts populated metrics with matching pool ids and a trailing 24 hour window', () => {
    it('accepts complete positive values with correct pool id and 24h window', () => {
      expect(isPositionListFinancialMetricsDto(validMetrics)).toBe(true);
    });

    it('accepts populated positionValue and unclaimedFees with multiple pools', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 1234.56,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: {
          valueUsd: 78.9,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'currently-claimable-trading-fees',
          scope: 'returned-supported-positions',
          excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
        },
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100_000,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 500,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
          'pool-2': {
            tvl: {
              poolId: 'pool-2' as import('@clmm/domain').PoolId,
              valueUsd: 200_000,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: {
              poolId: 'pool-2' as import('@clmm/domain').PoolId,
              valueUsd: 1000,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(true);
    });
  });

  describe('rejects negative or non-finite financial values', () => {
    it('rejects negative valueUsd in positionValue', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: -1,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects negative valueUsd in unclaimedFees', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: {
          valueUsd: -0.01,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'currently-claimable-trading-fees',
          scope: 'returned-supported-positions',
          excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
        },
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects negative valueUsd in pool tvl', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: -100,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects negative valueUsd in pool fees24h', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: -50,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects NaN valueUsd in positionValue', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: Number.NaN,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects positive infinity valueUsd in unclaimedFees', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: {
          valueUsd: Number.POSITIVE_INFINITY,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'currently-claimable-trading-fees',
          scope: 'returned-supported-positions',
          excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
        },
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects NaN valueUsd in pool tvl', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: Number.NaN,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects positive infinity valueUsd in pool fees24h', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: Number.POSITIVE_INFINITY,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });
  });

  describe('rejects incomplete source scope or timestamp metadata', () => {
    it('rejects empty source in positionValue', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 100,
          valuedAtUnixMs: 1_800_000_000_000,
          source: '',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects whitespace-only source in unclaimedFees', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: {
          valueUsd: 100,
          valuedAtUnixMs: 1_800_000_000_000,
          source: '   ',
          basis: 'currently-claimable-trading-fees',
          scope: 'returned-supported-positions',
          excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
        },
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects invalid Unix milliseconds in valuedAtUnixMs', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 100,
          valuedAtUnixMs: -1,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects non-integer Unix milliseconds in valuedAtUnixMs', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 100,
          valuedAtUnixMs: 1_800_000_000_000.5,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects incorrect basis in positionValue', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 100,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'wrong-basis' as PositionValueMetricDto['basis'],
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects incorrect scope in positionValue', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 100,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'wrong-scope' as PositionValueMetricDto['scope'],
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects incorrect excludes in positionValue', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: {
          valueUsd: 100,
          valuedAtUnixMs: 1_800_000_000_000,
          source: 'authoritative-test-source',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wrong-exclusion'] as unknown as PositionValueMetricDto['excludes'],
        },
        unclaimedFees: null,
        poolsById: {},
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects empty poolsById source', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              observedAtUnixMs: 1_800_000_000_000,
              source: '',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });
  });

  describe('rejects pool metric ids that do not match their poolsById keys', () => {
    it('rejects tvl poolId mismatch with map key', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'wrong-pool-id' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects fees24h poolId mismatch with map key', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'wrong-pool-id' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects when only one of two pool metrics matches key', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              observedAtUnixMs: 1_800_000_000_000,
              source: 'authoritative-test-source',
              scope: 'whole-orca-pool',
            },
            fees24h: {
              poolId: 'wrong-pool-id' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });
  });

  describe('rejects pool fee windows that are not exactly 24 hours', () => {
    it('rejects fees24h window that is not exactly 86400000 ms', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_800_000_000_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects fees24h window that is less than 24 hours', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_960_000_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects fees24h window that is greater than 24 hours', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_867_200_000,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects fees24h with non-integer window timestamps', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: 1_799_913_600_000.5,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });

    it('rejects fees24h with negative window timestamps', () => {
      const input: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-1': {
            tvl: null,
            fees24h: {
              poolId: 'pool-1' as import('@clmm/domain').PoolId,
              valueUsd: 100,
              source: 'authoritative-test-source',
              windowStartUnixMs: -1,
              windowEndUnixMs: 1_800_000_000_000,
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      expect(isPositionListFinancialMetricsDto(input)).toBe(false);
    });
  });
});
