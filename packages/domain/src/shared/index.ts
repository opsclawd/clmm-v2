// Branded IDs — prevent accidental mix-ups
export type PositionId = string & { readonly _brand: 'PositionId' };
export type WalletId = string & { readonly _brand: 'WalletId' };
export type PoolId = string & { readonly _brand: 'PoolId' };
export type ClockTimestamp = number & { readonly _brand: 'ClockTimestamp' };

export function makePositionId(raw: string): PositionId {
  return raw as PositionId;
}
export function makeWalletId(raw: string): WalletId {
  return raw as WalletId;
}
export function makePoolId(raw: string): PoolId {
  return raw as PoolId;
}
export function makeClockTimestamp(ms: number): ClockTimestamp {
  return ms as ClockTimestamp;
}

// BreachDirection — discriminated union, NEVER a boolean or string
export type BreachDirection =
  | { readonly kind: 'lower-bound-breach' }
  | { readonly kind: 'upper-bound-breach' };

export const LOWER_BOUND_BREACH: BreachDirection = { kind: 'lower-bound-breach' };
export const UPPER_BOUND_BREACH: BreachDirection = { kind: 'upper-bound-breach' };

// PostExitAssetPosture — discriminated union
export type PostExitAssetPosture =
  | { readonly kind: 'exit-to-usdc' }
  | { readonly kind: 'exit-to-sol' };

export const EXIT_TO_USDC: PostExitAssetPosture = { kind: 'exit-to-usdc' };
export const EXIT_TO_SOL: PostExitAssetPosture = { kind: 'exit-to-sol' };

// Asset symbols for swap instructions
export type AssetSymbol = 'SOL' | 'USDC';

// Token amounts — always stored as bigint (lamports / raw units)
export type TokenAmount = {
  readonly raw: bigint;
  readonly decimals: number;
  readonly symbol: AssetSymbol;
};

export function makeTokenAmount(
  raw: bigint,
  decimals: number,
  symbol: AssetSymbol,
): TokenAmount {
  return { raw, decimals, symbol };
}
