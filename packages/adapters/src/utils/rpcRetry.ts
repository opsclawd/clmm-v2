/**
 * Solana RPC retry utility.
 *
 * The public Solana RPC (api.mainnet-beta.solana.com) and some private RPCs
 * return HTTP 429 ("Too Many Requests") when rate-limited. This manifests as
 * a Solana error with code 8100002 (#8100002).
 *
 * This module provides `withRetry` which wraps an async RPC call and
 * automatically retries with exponential backoff + jitter on 429 errors.
 */

const SOLANA_RATE_LIMIT_CODE = '8100002';

/**
 * Returns true if the error is a Solana RPC rate-limit error (HTTP 429).
 */
export function isSolanaRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes(`#${SOLANA_RATE_LIMIT_CODE}`);
  }
  return false;
}

/**
 * Default retry configuration.
 */
const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 16_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Execute an async RPC call with automatic retry on Solana rate-limit errors.
 * Uses exponential backoff with jitter (decorrelated jitter variant).
 *
 * @param fn - The async RPC call to execute.
 * @param options.maxAttempts - Maximum number of attempts (default 4).
 * @param options.baseDelayMs - Initial delay in ms (default 500).
 * @param options.maxDelayMs - Maximum delay cap in ms (default 16000).
 * @throws The last error if all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {},
): Promise<T> {
  const { maxAttempts = DEFAULT_MAX_ATTEMPTS, baseDelayMs = BASE_DELAY_MS, maxDelayMs = MAX_DELAY_MS } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Only retry on Solana rate-limit errors (HTTP 429)
      if (!isSolanaRateLimitError(error)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        break;
      }

      // Exponential backoff with decorrelated jitter
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}
