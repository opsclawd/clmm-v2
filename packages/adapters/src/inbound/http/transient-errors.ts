/**
 * Detects transient failures originating from Solana RPC or network calls
 * that propagate through position-read or trigger-list operations.
 *
 * When detected, callers should degrade gracefully rather than returning 500.
 */
export function isTransientPositionReadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes('rpc') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('socket') ||
    message.includes('econn') ||
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  );
}
