/**
 * Solana RPC retry utility.
 *
 * The public Solana RPC (api.mainnet-beta.solana.com) and some private RPCs
 * return HTTP 429 ("Too Many Requests") when rate-limited. Solana surfaces
 * this in two ways:
 *   1. Error code #8100002 embedded in the message  (e.g. "…#8100002…")
 *   2. Plain HTTP 429 text  (e.g. "SolanaError: HTTP error (429): Too Many Requests")
 *
 * Both forms indicate a transient rate-limit condition and should be retried.
 */

/**
 * HTTP 429 indicators matched on a lowercased message to catch all variants
 * regardless of capitalisation (e.g. "429 Too Many Requests from upstream").
 * Numeric Solana error codes (#8100002) are checked case-sensitively.
 */
const SOLANA_RATE_LIMIT_CODE = '8100002';
const SOLANA_429_INDICATORS_LOWER = ['http error (429)', 'too many requests'];

/**
 * Returns true if the error is a Solana RPC rate-limit error (HTTP 429).
 * Handles both the Solana error-code form (#8100002) and the plain HTTP 429 form.
 * Performs case-insensitive matching for the HTTP text variants to catch all
 * capitalisation forms (e.g. "429 Too Many Requests from upstream").
 */
export function isSolanaRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes(`#${SOLANA_RATE_LIMIT_CODE}`)) return true;
    const msgLower = msg.toLowerCase();
    return SOLANA_429_INDICATORS_LOWER.some((indicator) => msgLower.includes(indicator));
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
