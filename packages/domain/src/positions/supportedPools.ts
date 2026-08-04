export const SOL_USDC_SUPPORTED_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

export const SUPPORTED_POOL_IDS: readonly string[] = [SOL_USDC_SUPPORTED_POOL_ID];

export function isSupportedPool(poolId: string): boolean {
  return SUPPORTED_POOL_IDS.includes(poolId);
}
